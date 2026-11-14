//! Pairing token for the LAN companion server.
//!
//! The companion listens on `0.0.0.0:1421` and used to accept every request from
//! the local network: any device on the same Wi-Fi could read the agent state,
//! send prompts and answer approvals. Once a token exists, every `/api/*` call
//! needs it.
//!
//! The phone sends it as `X-Narra-Token`. `EventSource` cannot set headers, so
//! `/api/events` also accepts `?t=<token>`.
//!
//! The token is a short, human-typable code stored next to the settings mirror:
//! `%APPDATA%\app.narra-notch.windows\companion-token.txt`. Until the desktop
//! creates one the server stays open, so a phone running an older build keeps
//! working and nobody is locked out before updating.

use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use aes_gcm::aead::{KeyInit, OsRng};
use aes_gcm::Aes256Gcm;
use serde_json::json;
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "companion-token.txt";
/// No `0/O/1/I`: the code is read off the desktop screen and typed on a phone.
const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN: usize = 8;
const MIN_LEN: usize = 6;

static TOKEN: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn slot() -> &'static Mutex<Option<String>> {
    TOKEN.get_or_init(|| Mutex::new(None))
}

fn token_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(FILE_NAME))
}

/// 8 characters from the 32-symbol alphabet. `generate_key` is the CSPRNG the
/// vault already uses; 256 is a multiple of 32, so the modulo has no bias.
fn generate() -> String {
    Aes256Gcm::generate_key(&mut OsRng)
        .iter()
        .take(CODE_LEN)
        .map(|b| ALPHABET[*b as usize % ALPHABET.len()] as char)
        .collect()
}

/// Load the stored token into memory. Called once before the server listens.
pub fn init(app: &AppHandle) {
    let stored = token_path(app)
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .map(|raw| raw.trim().to_string())
        .filter(|token| token.len() >= MIN_LEN);
    if let Ok(mut slot) = slot().lock() {
        *slot = stored;
    }
}

/// The token, or `None` while the server is still open to the whole network.
pub fn current() -> Option<String> {
    slot().lock().ok().and_then(|token| token.clone())
}

pub fn is_paired() -> bool {
    current().is_some()
}

/// True when the request may pass: no token configured (legacy, open) or a match.
/// Compared byte by byte so a wrong guess does not leak the matching prefix.
pub fn authorized(candidate: &str) -> bool {
    let Some(expected) = current() else {
        return true;
    };
    let expected = expected.as_bytes();
    let provided = candidate.trim().to_ascii_uppercase();
    let provided = provided.as_bytes();
    if expected.len() != provided.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in expected.iter().zip(provided) {
        diff |= a ^ b;
    }
    diff == 0
}

/// What Settings shows: whether the lock is on and the code to type on the phone.
#[tauri::command]
pub fn companion_token_status() -> serde_json::Value {
    json!({ "paired": is_paired(), "token": current() })
}

/// Create or replace the code. Replacing it signs every paired phone out.
#[tauri::command]
pub fn companion_token_create(app: AppHandle) -> Result<serde_json::Value, String> {
    let token = generate();
    let path = token_path(&app)?;
    fs::write(&path, token.as_bytes()).map_err(|e| e.to_string())?;
    if let Ok(mut slot) = slot().lock() {
        *slot = Some(token.clone());
    }
    crate::companion::broadcast_event("settings://pairing", &json!({ "paired": true }));
    Ok(json!({ "paired": true, "token": token }))
}

/// Turn the lock off again (every device on the LAN may connect, as before).
#[tauri::command]
pub fn companion_token_clear(app: AppHandle) -> Result<serde_json::Value, String> {
    if let Ok(path) = token_path(&app) {
        let _ = fs::remove_file(path);
    }
    if let Ok(mut slot) = slot().lock() {
        *slot = None;
    }
    crate::companion::broadcast_event("settings://pairing", &json!({ "paired": false }));
    Ok(json!({ "paired": false, "token": null }))
}
