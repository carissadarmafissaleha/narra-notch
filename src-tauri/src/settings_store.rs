//! Durable settings copy.
//!
//! The frontend keeps settings in localStorage, which lives inside the WebView2
//! profile. Installer updates and profile repairs can replace that profile, so
//! the same JSON is mirrored here:
//!
//! `%APPDATA%\app.narra-notch.windows\settings.json`
//!
//! `%APPDATA%` is not touched by an in-place update. Rust also injects the file
//! into the page before the bundle runs (see `lib.rs`), so a wiped profile is
//! restored without a visible reset.

use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "settings.json";

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(FILE_NAME))
}

/// Newest valid copy: the main file, otherwise the `.bak` from the last write.
pub fn read_settings(app: &AppHandle) -> Option<(String, u64)> {
    let path = settings_path(app).ok()?;
    let backup = path.with_extension("json.bak");

    for candidate in [&path, &backup] {
        let Ok(raw) = fs::read_to_string(candidate) else {
            continue;
        };
        if raw.trim().is_empty() || serde_json::from_str::<serde_json::Value>(&raw).is_err() {
            continue;
        }
        let modified = fs::metadata(candidate)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        return Some((raw, modified));
    }
    None
}

#[tauri::command]
pub fn settings_load(app: AppHandle) -> Option<String> {
    read_settings(&app).map(|(raw, _)| raw)
}

#[tauri::command]
pub fn settings_save(app: AppHandle, content: String) -> Result<(), String> {
    // Never replace a good file with a half-written or malformed one.
    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|e| format!("Invalid settings JSON: {e}"))?;

    let path = settings_path(&app)?;
    let backup = path.with_extension("json.bak");

    if path.exists() {
        let _ = fs::copy(&path, &backup);
    }

    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, content.as_bytes()).map_err(|e| e.to_string())?;
    fs::copy(&tmp, &path).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&tmp);
    Ok(())
}
