use std::fs;
use std::sync::{Arc, Mutex};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::{State, Emitter};

struct AppState {
    is_transcribing: Arc<Mutex<bool>>,
}

#[derive(serde::Serialize)]
struct Session {
    id: String,
    name: String,
    path: String,
    video_path: String,
    created_at: u64,
}

#[tauri::command]
fn get_sessions() -> Result<Vec<Session>, String> {
    let home_dir = dirs::home_dir().ok_or("Could not find home directory")?;
    let target_dir = home_dir.join("Downloads").join("CognitoCall");

    if !target_dir.exists() {
        return Ok(vec![]);
    }

    let mut sessions = Vec::new();

    if let Ok(entries) = fs::read_dir(target_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            
            if path.is_dir() {
                let video_path = path.join("video.webm");
                
                if video_path.exists() {
                    let metadata = entry.metadata().map_err(|e| e.to_string())?;
                    let created_at = metadata
                        .created()
                        .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                        .duration_since(std::time::SystemTime::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();

                    let folder_name = entry.file_name().to_string_lossy().to_string();
                    let mut name = folder_name.clone();

                    // Read custom name from metadata.json if it exists
                    let metadata_path = path.join("metadata.json");
                    if metadata_path.exists() {
                        if let Ok(content) = fs::read_to_string(&metadata_path) {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                                if let Some(n) = json.get("name").and_then(|v| v.as_str()) {
                                    name = n.to_string();
                                }
                            }
                        }
                    }

                    sessions.push(Session {
                        id: folder_name,
                        name,
                        path: path.to_string_lossy().to_string(),
                        video_path: video_path.to_string_lossy().to_string(),
                        created_at,
                    });
                }
            }
        }
    }

    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(sessions)
}

#[tauri::command]
async fn process_recording(folder_path: String, window: tauri::Window, state: State<'_, AppState>) -> Result<(), String> {
    let mut is_transcribing = state.is_transcribing.lock().unwrap();
    if *is_transcribing {
        return Err("A transcription job is already running. Please wait to prevent RAM overload.".into());
    }
    *is_transcribing = true;
    drop(is_transcribing); // Unlock immediately so we don't freeze

    let transcribing_flag = Arc::clone(&state.is_transcribing);

    // 2. Spawn Sidecar in a new OS thread
    std::thread::spawn(move || {
        // Try to use the local venv python explicitly so it doesn't use the system python
        let python_bin = if std::path::Path::new("../venv/bin/python3").exists() {
            "../venv/bin/python3"
        } else {
            "python3"
        };

        let mut child_process = Command::new(python_bin)
            .arg("../python/transcriber.py") 
            .arg(&folder_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("Failed to start Python transcriber sidecar");

        // Stream stdout lines to the frontend
        if let Some(stdout) = child_process.stdout.take() {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(log) = line {
                    window.emit("transcription-progress", log).unwrap();
                }
            }
        }
        
        // Stream stderr lines in case of crash
        if let Some(stderr) = child_process.stderr.take() {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(log) = line {
                    // Send error as a string message
                    println!("Python Error: {}", log);
                }
            }
        }

        let status = child_process.wait().unwrap();

        // 3. Release Lock
        let mut transcribing_flag = transcribing_flag.lock().unwrap();
        *transcribing_flag = false;
        
        if status.success() {
            window.emit("transcription-progress", "{\"status\": \"finished\", \"message\": \"Transcription completed successfully\"}").unwrap();
        } else {
            window.emit("transcription-progress", "{\"status\": \"error\", \"message\": \"Python script crashed. Check terminal output.\"}").unwrap();
        }
    });


    Ok(())
}

#[derive(serde::Serialize)]
struct SessionDetails {
    name: String,
    notes: String,
    action_items: String,
    transcript_exists: bool,
}

#[tauri::command]
fn get_session_details(path: String) -> Result<SessionDetails, String> {
    let folder_path = std::path::Path::new(&path);
    if !folder_path.exists() {
        return Err("Session folder does not exist".to_string());
    }

    let folder_name = folder_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut name = folder_name;
        
    let metadata_path = folder_path.join("metadata.json");
    if metadata_path.exists() {
        if let Ok(content) = fs::read_to_string(&metadata_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(n) = json.get("name").and_then(|v| v.as_str()) {
                    name = n.to_string();
                }
            }
        }
    }

    let notes_path = folder_path.join("notes.txt");
    let notes = if notes_path.exists() {
        fs::read_to_string(&notes_path).unwrap_or_default()
    } else {
        "".to_string()
    };

    let action_items_path = folder_path.join("action_items.txt");
    let action_items = if action_items_path.exists() {
        fs::read_to_string(&action_items_path).unwrap_or_default()
    } else {
        "".to_string()
    };

    let transcript_path = folder_path.join("transcript.json");
    let transcript_exists = transcript_path.exists();

    Ok(SessionDetails {
        name,
        notes,
        action_items,
        transcript_exists,
    })
}

#[tauri::command]
fn rename_session(path: String, new_name: String) -> Result<(), String> {
    let folder_path = std::path::Path::new(&path);
    if !folder_path.exists() {
        return Err("Session folder does not exist".to_string());
    }
    let metadata_path = folder_path.join("metadata.json");
    let mut data = serde_json::Map::new();
    
    if metadata_path.exists() {
        if let Ok(content) = fs::read_to_string(&metadata_path) {
            if let Ok(serde_json::Value::Object(map)) = serde_json::from_str(&content) {
                data = map;
            }
        }
    }
    
    data.insert("name".to_string(), serde_json::Value::String(new_name));
    
    let file = fs::File::create(&metadata_path).map_err(|e| e.to_string())?;
    serde_json::to_writer_pretty(file, &data).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn save_session_notes(path: String, notes: String) -> Result<(), String> {
    let folder_path = std::path::Path::new(&path);
    if !folder_path.exists() {
        return Err("Session folder does not exist".to_string());
    }
    let notes_path = folder_path.join("notes.txt");
    fs::write(notes_path, notes).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_session_action_items(path: String, action_items: String) -> Result<(), String> {
    let folder_path = std::path::Path::new(&path);
    if !folder_path.exists() {
        return Err("Session folder does not exist".to_string());
    }
    let action_items_path = folder_path.join("action_items.txt");
    fs::write(action_items_path, action_items).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            is_transcribing: Arc::new(Mutex::new(false)),
        })
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_sessions,
            process_recording,
            get_session_details,
            rename_session,
            save_session_notes,
            save_session_action_items
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
