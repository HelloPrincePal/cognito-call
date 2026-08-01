use std::fs;
use std::sync::{Arc, Mutex};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::{State, Emitter, Manager};

struct AppState {
    is_transcribing: Arc<Mutex<bool>>,
    current_transcribing_path: Arc<Mutex<Option<String>>>,
    active_pid: Arc<Mutex<Option<u32>>>,
}

#[derive(serde::Serialize)]
struct Session {
    id: String,
    name: String,
    display_name: String,
    path: String,
    video_path: String,
    created_at: u64,
    is_processing: bool,
    has_summary: bool,
}

fn format_folder_name_to_date(folder_name: &str) -> String {
    let parts: Vec<&str> = folder_name.split('_').collect();
    if !parts.is_empty() {
        let date_part = parts[0];
        let date_parts: Vec<&str> = date_part.split('-').collect();
        if date_parts.len() == 3 {
            let year = date_parts[0];
            let month_num = date_parts[1];
            let day = date_parts[2];
            
            let month = match month_num {
                "01" => "Jan",
                "02" => "Feb",
                "03" => "Mar",
                "04" => "Apr",
                "05" => "May",
                "06" => "Jun",
                "07" => "Jul",
                "08" => "Aug",
                "09" => "Sep",
                "10" => "Oct",
                "11" => "Nov",
                "12" => "Dec",
                _ => month_num,
            };
            
            let day_clean = if day.starts_with('0') && day.len() > 1 {
                &day[1..]
            } else {
                day
            };
            
            return format!("{} {}, {}", month, day_clean, year);
        }
    }
    folder_name.to_string()
}

fn spawn_transcription_job(
    folder_path: String,
    user_name: Option<String>,
    window: tauri::Window, 
    is_transcribing_flag: Arc<Mutex<bool>>, 
    current_path_flag: Arc<Mutex<Option<String>>>,
    active_pid_flag: Arc<Mutex<Option<u32>>>,
) {
    std::thread::spawn(move || {
        // Set the current path undergoing transcription
        {
            let mut current_path = current_path_flag.lock().unwrap();
            *current_path = Some(folder_path.clone());
        }

        // Use cognito-assistant process name so it displays clearly in macOS Activity Monitor / Task Manager
        let python_bin_path = if std::path::Path::new("../venv/bin/python3").exists() {
            std::path::PathBuf::from("../venv/bin/python3")
        } else {
            std::path::PathBuf::from("python3")
        };

        let helper_bin = if let Some(parent) = python_bin_path.parent() {
            let symlink_path = parent.join("cognito-assistant");
            if !symlink_path.exists() {
                #[cfg(unix)]
                let _ = std::os::unix::fs::symlink(&python_bin_path, &symlink_path);
            }
            if symlink_path.exists() {
                symlink_path
            } else {
                python_bin_path
            }
        } else {
            python_bin_path
        };

        let u_name = user_name.unwrap_or_else(|| "Me".to_string());

        let mut child_process = match Command::new(&helper_bin)
            .arg("../python/transcriber.py") 
            .arg(&folder_path)
            .arg("--user-name")
            .arg(&u_name)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn() {
                Ok(child) => child,
                Err(e) => {
                    println!("Failed to start Python sidecar: {}", e);
                    let mut is_t = is_transcribing_flag.lock().unwrap();
                    *is_t = false;
                    let mut cur = current_path_flag.lock().unwrap();
                    *cur = None;
                    return;
                }
            };

        let pid = child_process.id();
        {
            let mut p = active_pid_flag.lock().unwrap();
            *p = Some(pid);
        }

        let stdout = child_process.stdout.take();
        let stderr = child_process.stderr.take();

        // Stream stdout lines to the frontend
        if let Some(out) = stdout {
            let reader = BufReader::new(out);
            for line in reader.lines() {
                if let Ok(log) = line {
                    window.emit("transcription-progress", log).unwrap();
                }
            }
        }
        
        // Stream stderr lines in case of crash
        if let Some(err) = stderr {
            let reader = BufReader::new(err);
            for line in reader.lines() {
                if let Ok(log) = line {
                    println!("Python Error: {}", log);
                }
            }
        }

        let status_res = child_process.wait().ok();

        // Release Lock and clear current path
        {
            let mut current_path = current_path_flag.lock().unwrap();
            *current_path = None;
        }
        {
            let mut p = active_pid_flag.lock().unwrap();
            *p = None;
        }
        let mut transcribing_flag = is_transcribing_flag.lock().unwrap();
        *transcribing_flag = false;
        
        if let Some(status) = status_res {
            if status.success() {
                window.emit("transcription-progress", "{\"status\": \"finished\", \"message\": \"Transcription completed successfully\"}").unwrap();
            } else {
                window.emit("transcription-progress", "{\"status\": \"error\", \"message\": \"Python script stopped or exited.\"}").unwrap();
            }
        }
    });
}

#[tauri::command]
fn get_sessions(state: State<'_, AppState>, window: tauri::Window, user_name: Option<String>) -> Result<Vec<Session>, String> {
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
                    let mut display_name = format_folder_name_to_date(&folder_name);

                    // Read custom name from metadata.json if it exists
                    let metadata_path = path.join("metadata.json");
                    if metadata_path.exists() {
                        if let Ok(content) = fs::read_to_string(&metadata_path) {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                                if let Some(n) = json.get("display_name").and_then(|v| v.as_str()) {
                                    display_name = n.to_string();
                                    name = n.to_string();
                                } else if let Some(n) = json.get("name").and_then(|v| v.as_str()) {
                                    display_name = n.to_string();
                                    name = n.to_string();
                                }
                            }
                        }
                    }

                    let has_summary = path.join("summary.json").exists();
                    let currently_processing_path = state.current_transcribing_path.lock().unwrap();
                    let is_processing = currently_processing_path.as_ref()
                        .map(|p| p == &path.to_string_lossy().to_string())
                        .unwrap_or(false);

                    sessions.push(Session {
                        id: folder_name,
                        name,
                        display_name,
                        path: path.to_string_lossy().to_string(),
                        video_path: video_path.to_string_lossy().to_string(),
                        created_at,
                        is_processing,
                        has_summary,
                    });
                }
            }
        }
    }

    // Sort sessions newest first
    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    // "Recent-Only" Startup logic: Auto-run background transcription for only the newest session if it lacks a summary
    if let Some(newest_session) = sessions.first_mut() {
        if !newest_session.has_summary {
            let mut is_transcribing = state.is_transcribing.lock().unwrap();
            if !*is_transcribing {
                *is_transcribing = true;
                newest_session.is_processing = true;
                
                // Spawn background transcription
                spawn_transcription_job(
                    newest_session.path.clone(),
                    user_name.clone(),
                    window,
                    Arc::clone(&state.is_transcribing),
                    Arc::clone(&state.current_transcribing_path),
                    Arc::clone(&state.active_pid),
                );
            }
        }
    }

    Ok(sessions)
}

#[tauri::command]
async fn process_recording(folder_path: String, user_name: Option<String>, window: tauri::Window, state: State<'_, AppState>) -> Result<(), String> {
    let mut is_transcribing = state.is_transcribing.lock().unwrap();
    if *is_transcribing {
        return Err("A transcription job is already running. Please wait to prevent RAM overload.".into());
    }
    *is_transcribing = true;
    drop(is_transcribing); // Unlock immediately so we don't freeze

    spawn_transcription_job(
        folder_path,
        user_name,
        window,
        Arc::clone(&state.is_transcribing),
        Arc::clone(&state.current_transcribing_path),
        Arc::clone(&state.active_pid),
    );

    Ok(())
}

#[tauri::command]
fn cancel_transcription(state: State<'_, AppState>, window: tauri::Window) -> Result<(), String> {
    let pid_opt = {
        let mut p = state.active_pid.lock().unwrap();
        p.take()
    };

    if let Some(pid) = pid_opt {
        std::thread::spawn(move || {
            #[cfg(target_os = "windows")]
            {
                let _ = Command::new("taskkill").args(&["/F", "/PID", &pid.to_string()]).output();
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = Command::new("kill").args(&["-9", &pid.to_string()]).output();
            }
        });
    }

    {
        let mut current_path = state.current_transcribing_path.lock().unwrap();
        *current_path = None;
    }
    {
        let mut is_transcribing = state.is_transcribing.lock().unwrap();
        *is_transcribing = false;
    }

    let _ = window.emit("transcription-progress", "{\"status\": \"error\", \"message\": \"Transcription process cancelled by user.\"}");
    Ok(())
}

#[tauri::command]
fn clean_app_data() -> Result<(), String> {
    let home_dir = dirs::home_dir().ok_or("Could not find home directory")?;
    let data_dir = home_dir.join(".cognitocall");
    let cache_dir = home_dir.join(".cache").join("huggingface").join("hub");

    let _ = fs::remove_dir_all(&data_dir);

    if cache_dir.exists() {
        if let Ok(entries) = fs::read_dir(cache_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.contains("mlx-community") || name.contains("simple-diarizer") {
                    let _ = fs::remove_dir_all(entry.path());
                }
            }
        }
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct ActionItem {
    text: String,
    done: bool,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct SummaryData {
    notes: serde_json::Value,
    action_items: Vec<ActionItem>,
}

#[derive(serde::Serialize)]
struct SessionDetails {
    name: String,
    notes: serde_json::Value,
    action_items: String,
    transcript_exists: bool,
}

fn parse_serialized_action_items(text: &str) -> Vec<ActionItem> {
    if text.trim().is_empty() {
        return vec![];
    }
    text.split('\n')
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            if line.starts_with("[x] ") || line.starts_with("[X] ") {
                ActionItem {
                    text: line[4..].to_string(),
                    done: true,
                }
            } else if line.starts_with("[ ] ") {
                ActionItem {
                    text: line[4..].to_string(),
                    done: false,
                }
            } else {
                ActionItem {
                    text: line.to_string(),
                    done: false,
                }
            }
        })
        .collect()
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
                if let Some(n) = json.get("display_name").and_then(|v| v.as_str()) {
                    name = n.to_string();
                } else if let Some(n) = json.get("name").and_then(|v| v.as_str()) {
                    name = n.to_string();
                }
            }
        }
    }

    let summary_path = folder_path.join("summary.json");
    let (notes, action_items) = if summary_path.exists() {
        if let Ok(content) = fs::read_to_string(&summary_path) {
            if let Ok(summary) = serde_json::from_str::<SummaryData>(&content) {
                let serialized_items: Vec<String> = summary.action_items.iter().map(|item| {
                    format!("{} {}", if item.done { "[x]" } else { "[ ]" }, item.text)
                }).collect();
                (summary.notes, serialized_items.join("\n"))
            } else {
                (serde_json::Value::String("".to_string()), "".to_string())
            }
        } else {
            (serde_json::Value::String("".to_string()), "".to_string())
        }
    } else {
        let notes_path = folder_path.join("notes.txt");
        let notes = if notes_path.exists() {
            serde_json::Value::String(fs::read_to_string(&notes_path).unwrap_or_default())
        } else {
            serde_json::Value::String("".to_string())
        };

        let action_items_path = folder_path.join("action_items.txt");
        let action_items = if action_items_path.exists() {
            fs::read_to_string(&action_items_path).unwrap_or_default()
        } else {
            "".to_string()
        };
        (notes, action_items)
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
    
    data.insert("name".to_string(), serde_json::Value::String(new_name.clone()));
    data.insert("display_name".to_string(), serde_json::Value::String(new_name));
    
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
    
    let summary_path = folder_path.join("summary.json");
    let notes_value = if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&notes) {
        parsed
    } else {
        serde_json::Value::String(notes.clone())
    };

    if summary_path.exists() {
        let mut summary_data = if let Ok(content) = fs::read_to_string(&summary_path) {
            serde_json::from_str::<serde_json::Value>(&content).unwrap_or_default()
        } else {
            serde_json::Value::Object(serde_json::Map::new())
        };
        
        if let Some(obj) = summary_data.as_object_mut() {
            obj.insert("notes".to_string(), notes_value);
        }
        
        let file = fs::File::create(&summary_path).map_err(|e| e.to_string())?;
        serde_json::to_writer_pretty(file, &summary_data).map_err(|e| e.to_string())?;
    } else {
        let notes_path = folder_path.join("notes.txt");
        fs::write(notes_path, notes).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn save_session_action_items(path: String, action_items: String) -> Result<(), String> {
    let folder_path = std::path::Path::new(&path);
    if !folder_path.exists() {
        return Err("Session folder does not exist".to_string());
    }
    
    let summary_path = folder_path.join("summary.json");
    if summary_path.exists() {
        let tasks = parse_serialized_action_items(&action_items);
        
        let mut summary_data = if let Ok(content) = fs::read_to_string(&summary_path) {
            serde_json::from_str::<serde_json::Value>(&content).unwrap_or_default()
        } else {
            serde_json::Value::Object(serde_json::Map::new())
        };
        
        if let Some(obj) = summary_data.as_object_mut() {
            obj.insert("action_items".to_string(), serde_json::json!(tasks));
        }
        
        let file = fs::File::create(&summary_path).map_err(|e| e.to_string())?;
        serde_json::to_writer_pretty(file, &summary_data).map_err(|e| e.to_string())?;
    } else {
        let action_items_path = folder_path.join("action_items.txt");
        fs::write(action_items_path, action_items).map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let scale_factor = monitor.scale_factor();
                    let physical_size = monitor.size();
                    let logical_width = physical_size.width as f64 / scale_factor;
                    let logical_height = physical_size.height as f64 / scale_factor;

                    // Target aspect ratio: 1440 x 900 (1.6)
                    let target_aspect_ratio = 1440.0 / 900.0;
                    
                    // Occupy up to 90% of screen size while strictly enforcing 1440:900 aspect ratio
                    let max_target_w = logical_width * 0.90;
                    let max_target_h = logical_height * 0.90;

                    let (win_w, win_h) = if (max_target_w / max_target_h) > target_aspect_ratio {
                        let h = max_target_h;
                        let w = h * target_aspect_ratio;
                        (w, h)
                    } else {
                        let w = max_target_w;
                        let h = w / target_aspect_ratio;
                        (w, h)
                    };

                    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(win_w, win_h)));
                    let _ = window.center();
                }
            }
            Ok(())
        })
        .manage(AppState {
            is_transcribing: Arc::new(Mutex::new(false)),
            current_transcribing_path: Arc::new(Mutex::new(None)),
            active_pid: Arc::new(Mutex::new(None)),
        })
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_sessions,
            process_recording,
            cancel_transcription,
            clean_app_data,
            get_session_details,
            rename_session,
            save_session_notes,
            save_session_action_items
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<AppState>();
                let pid_opt = {
                    let mut p = state.active_pid.lock().unwrap();
                    p.take()
                };
                if let Some(pid) = pid_opt {
                    #[cfg(target_os = "windows")]
                    let _ = Command::new("taskkill").args(&["/F", "/PID", &pid.to_string()]).output();
                    #[cfg(not(target_os = "windows"))]
                    let _ = Command::new("kill").args(&["-9", &pid.to_string()]).output();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
