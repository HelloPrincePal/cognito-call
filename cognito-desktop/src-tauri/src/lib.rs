use std::fs;
use tauri::Manager;

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

                    let name = entry.file_name().to_string_lossy().to_string();

                    sessions.push(Session {
                        id: name.clone(),
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![get_sessions])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
