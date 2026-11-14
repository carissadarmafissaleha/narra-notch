//! Mobile PWA Companion server for iPhone & local network.
//! Dedicated, ultra-clean, mobile-friendly interface for the Coding Agent & Mochi.

use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;

use crate::agent::{self, AgentState};
use crate::companion_auth;

// Version 1.4.2 - Approval only on demand, compact mobile
#[derive(RustEmbed)]
#[folder = "../dist"]
struct DistAssets;

pub const COMPANION_PORT: u16 = 1421;
const ICON_BYTES: &[u8] = include_bytes!("../icons/pwa-512.png");

static BROADCAST_TX: OnceLock<broadcast::Sender<String>> = OnceLock::new();
static COMPANION_LANG: OnceLock<std::sync::Mutex<String>> = OnceLock::new();
/// `None` until the desktop reports the outfit it uses. The phone must not
/// overwrite a stored outfit with a guess (that made it look like the chosen
/// Mochi skin vanished after every restart).
static COMPANION_OUTFIT: OnceLock<std::sync::Mutex<Option<String>>> = OnceLock::new();
/// Chat tab visibility, owned by the desktop settings (default: hidden).
static COMPANION_CHAT: AtomicBool = AtomicBool::new(false);
/// OpenCode chat tab visibility, owned by the desktop settings (default: hidden).
static COMPANION_OPENCODE_CHAT: AtomicBool = AtomicBool::new(false);
/// Version reported by the phone/PWA companion: (platform, version). `None`
/// until an app connects, so the desktop can show which build the phone runs.
static COMPANION_CLIENT: OnceLock<std::sync::Mutex<Option<(String, String)>>> = OnceLock::new();

pub fn set_companion_client(platform: &str, version: &str) {
    let mutex = COMPANION_CLIENT.get_or_init(|| std::sync::Mutex::new(None));
    if let Ok(mut client) = mutex.lock() {
        *client = Some((platform.to_string(), version.to_string()));
    }
}

pub fn get_companion_client() -> Option<(String, String)> {
    COMPANION_CLIENT
        .get_or_init(|| std::sync::Mutex::new(None))
        .lock()
        .ok()
        .and_then(|client| client.clone())
}

/// Desktop version plus the version the connected phone/PWA reported.
#[tauri::command]
pub fn companion_versions() -> serde_json::Value {
    let client = get_companion_client();
    json!({
        "windows": env!("CARGO_PKG_VERSION"),
        "client": client.map(|(platform, version)| json!({
            "platform": platform,
            "version": version,
        })),
    })
}

pub fn set_companion_language(lang: &str) {
    let mutex = COMPANION_LANG.get_or_init(|| std::sync::Mutex::new("id".to_string()));
    if let Ok(mut l) = mutex.lock() {
        *l = lang.to_string();
    }
    broadcast_event("settings://language", &json!({ "language": lang }));
}

pub fn get_companion_language() -> String {
    let mutex = COMPANION_LANG.get_or_init(|| std::sync::Mutex::new("id".to_string()));
    mutex
        .lock()
        .map(|l| l.clone())
        .unwrap_or_else(|_| "id".to_string())
}

pub fn set_companion_outfit(outfit: &str) {
    let mutex = COMPANION_OUTFIT.get_or_init(|| std::sync::Mutex::new(None));
    if let Ok(mut l) = mutex.lock() {
        *l = Some(outfit.to_string());
    }
    broadcast_event("settings://outfit", &json!({ "outfit": outfit }));
}

pub fn get_companion_outfit() -> Option<String> {
    let mutex = COMPANION_OUTFIT.get_or_init(|| std::sync::Mutex::new(None));
    mutex.lock().ok().and_then(|l| l.clone())
}

/// Settings payload shared by `/api/settings` and the SSE `init` frame. The
/// outfit is only included once the desktop has reported one.
fn companion_settings() -> serde_json::Value {
    let ask = crate::agent::ask_permissions();
    let mut map = serde_json::Map::new();
    map.insert("language".to_string(), json!(get_companion_language()));
    map.insert("chatEnabled".to_string(), json!(get_companion_chat_enabled()));
    map.insert("opencodeChatEnabled".to_string(), json!(get_companion_opencode_chat_enabled()));
    map.insert("askPermissions".to_string(), json!(ask));
    map.insert("turbo".to_string(), json!(!ask));
    if let Some(outfit) = get_companion_outfit() {
        map.insert("outfit".to_string(), json!(outfit));
    }
    serde_json::Value::Object(map)
}

pub fn set_companion_chat_enabled(enabled: bool) {
    COMPANION_CHAT.store(enabled, Ordering::Relaxed);
    broadcast_event("settings://chat", &json!({ "chatEnabled": enabled }));
}

pub fn get_companion_chat_enabled() -> bool {
    COMPANION_CHAT.load(Ordering::Relaxed)
}

pub fn set_companion_opencode_chat_enabled(enabled: bool) {
    COMPANION_OPENCODE_CHAT.store(enabled, Ordering::Relaxed);
    broadcast_event("settings://opencode_chat", &json!({ "opencodeChatEnabled": enabled }));
}

pub fn get_companion_opencode_chat_enabled() -> bool {
    COMPANION_OPENCODE_CHAT.load(Ordering::Relaxed)
}

fn get_broadcast_tx() -> &'static broadcast::Sender<String> {
    BROADCAST_TX.get_or_init(|| {
        let (tx, _) = broadcast::channel(100);
        tx
    })
}

pub fn broadcast_event(event_type: &str, data: &serde_json::Value) {
    let tx = get_broadcast_tx();
    let msg = json!({
        "type": event_type,
        "data": data,
    })
    .to_string();
    let _ = tx.send(msg);
}

pub fn get_local_ip() -> String {
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

#[derive(Serialize)]
pub struct CompanionInfo {
    pub ip: String,
    pub port: u16,
    pub url: String,
}

pub fn get_companion_info() -> CompanionInfo {
    let ip = get_local_ip();
    let url = format!("http://{}:{}", ip, COMPANION_PORT);
    CompanionInfo {
        ip,
        port: COMPANION_PORT,
        url,
    }
}

#[derive(Deserialize)]
struct RespondPayload {
    id: String,
    allow: bool,
    #[serde(default)]
    always: bool,
}

pub fn start_server(app: AppHandle) {
    let _ = get_broadcast_tx();
    // Pairing code from the last run: without it every /api/* call is open.
    companion_auth::init(&app);

    std::thread::spawn(move || {
        let rt = match tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
        {
            Ok(rt) => rt,
            Err(e) => {
                eprintln!("[companion] Failed to create tokio runtime: {}", e);
                return;
            }
        };

        rt.block_on(async move {
            let addr: SocketAddr = ([0, 0, 0, 0], COMPANION_PORT).into();
            let mut listener_opt = None;
            for _ in 0..30 {
                match TcpListener::bind(addr).await {
                    Ok(l) => {
                        listener_opt = Some(l);
                        break;
                    }
                    Err(_) => {
                        tokio::time::sleep(Duration::from_millis(500)).await;
                    }
                }
            }
            let listener = match listener_opt {
                Some(l) => l,
                None => {
                    eprintln!("[companion] Failed to bind 0.0.0.0:{}", COMPANION_PORT);
                    return;
                }
            };

            let local_ip = get_local_ip();
            println!(
                "[companion] PWA Server listening on http://0.0.0.0:{} (Open on iPhone: http://{}:{})",
                COMPANION_PORT, local_ip, COMPANION_PORT
            );

            loop {
                match listener.accept().await {
                    Ok((stream, remote_addr)) => {
                        let app_clone = app.clone();
                        tokio::spawn(async move {
                            let _ = handle_connection(stream, remote_addr, app_clone).await;
                        });
                    }
                    Err(e) => {
                        eprintln!("[companion] accept error: {}", e);
                        tokio::time::sleep(Duration::from_millis(100)).await;
                    }
                }
            }
        });
    });
}

/// One-shot JSON response for the OpenCode passthrough routes.
async fn write_json(
    stream: &mut TcpStream,
    status: &str,
    value: &serde_json::Value,
) -> std::io::Result<()> {
    let body = value.to_string();
    let resp = format!(
        "HTTP/1.1 {}\r\n\
         Content-Type: application/json; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Connection: close\r\n\r\n{}",
        status,
        body.len(),
        body
    );
    stream.write_all(resp.as_bytes()).await?;
    stream.flush().await
}

/// Largest request head the companion accepts before giving up.
const MAX_HEADER_BYTES: usize = 64 * 1024;
/// Largest JSON body the companion accepts.
const MAX_BODY_BYTES: usize = 1024 * 1024;

/// End of the header block (index just past the blank line), once complete.
fn header_end(bytes: &[u8]) -> Option<usize> {
    bytes
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|pos| pos + 4)
        .or_else(|| {
            bytes
                .windows(2)
                .position(|window| window == b"\n\n")
                .map(|pos| pos + 2)
        })
}

/// `Content-Length` from the header block.
fn content_length(head: &[u8]) -> Option<usize> {
    let text = std::str::from_utf8(head).ok()?;
    text.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if !name.trim().eq_ignore_ascii_case("content-length") {
            return None;
        }
        value.trim().parse::<usize>().ok()
    })
}

/// Request body after the header block.
fn body_of(raw_req: &str) -> &str {
    if let Some(pos) = raw_req.find("\r\n\r\n") {
        &raw_req[pos + 4..]
    } else if let Some(pos) = raw_req.find("\n\n") {
        &raw_req[pos + 2..]
    } else {
        ""
    }
}

/// Extract a header value (case-insensitive) from the HTTP request head.
fn header_value<'a>(raw_req: &'a str, key: &str) -> Option<&'a str> {
    raw_req
        .lines()
        .take_while(|line| !line.trim().is_empty())
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.trim()
                .eq_ignore_ascii_case(key)
                .then(|| value.trim())
        })
}

/// Reject cross-origin requests from external websites on the internet while
/// allowing Capacitor shells (`capacitor://localhost`, `http://localhost`),
/// local dev/Tauri views, and private LAN PWA origins.
fn is_allowed_origin(origin: Option<&str>) -> bool {
    let Some(origin) = origin.map(str::trim).filter(|o| !o.is_empty()) else {
        return true;
    };
    let lower = origin.to_ascii_lowercase();
    if lower == "capacitor://localhost"
        || lower == "tauri://localhost"
        || lower == "http://tauri.localhost"
        || lower == "https://tauri.localhost"
        || lower == "http://localhost"
        || lower == "https://localhost"
        || lower.starts_with("http://localhost:")
        || lower.starts_with("https://localhost:")
        || lower == "http://127.0.0.1"
        || lower.starts_with("http://127.0.0.1:")
    {
        return true;
    }
    if let Some(rest) = lower.strip_prefix("http://") {
        let host = rest.split('/').next().unwrap_or(rest);
        let host = host.split(':').next().unwrap_or(host);
        if let Ok(ip) = host.parse::<std::net::Ipv4Addr>() {
            return ip.is_private() || ip.is_loopback() || ip.is_link_local();
        }
    }
    false
}

/// `?key=value` from the raw request target, percent-decoded.
fn query_param(raw_uri: &str, key: &str) -> Option<String> {
    let query = raw_uri.split_once('?')?.1;
    let raw = query
        .split('&')
        .find_map(|pair| pair.strip_prefix(&format!("{}=", key)))?;
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?;
                out.push(u8::from_str_radix(hex, 16).ok()?);
                i += 2;
            }
            byte => out.push(byte),
        }
        i += 1;
    }
    String::from_utf8(out).ok()
}

async fn handle_connection(
    mut stream: TcpStream,
    _remote: SocketAddr,
    app: AppHandle,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut raw: Vec<u8> = Vec::with_capacity(8192);
    let mut chunk = [0u8; 8192];
    // Headers can arrive split across segments; read until the blank line.
    loop {
        let n = stream.read(&mut chunk).await?;
        if n == 0 {
            break;
        }
        raw.extend_from_slice(&chunk[..n]);
        if header_end(&raw).is_some() || raw.len() >= MAX_HEADER_BYTES {
            break;
        }
    }
    if raw.is_empty() {
        return Ok(());
    }

    // A POST body often arrives in a later segment than its headers. Keep
    // reading until `Content-Length` is satisfied, otherwise a phone's JSON
    // payload would be cut off after the first packet.
    let head_len = header_end(&raw).unwrap_or(raw.len());
    if let Some(length) = content_length(&raw[..head_len]) {
        let length = length.min(MAX_BODY_BYTES);
        while raw.len() < head_len + length {
            let n = stream.read(&mut chunk).await?;
            if n == 0 {
                break;
            }
            raw.extend_from_slice(&chunk[..n]);
        }
    }

    let raw_req = String::from_utf8_lossy(&raw);
    let mut lines = raw_req.lines();
    let request_line = match lines.next() {
        Some(l) => l,
        None => return Ok(()),
    };

    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        return Ok(());
    }

    let method = parts[0];
    let raw_uri = parts[1];
    let uri = raw_uri.split('?').next().unwrap_or(raw_uri);

    let origin = header_value(&raw_req, "origin");
    if !is_allowed_origin(origin) {
        let body = json!({ "error": "forbidden_origin" }).to_string();
        let resp = format!(
            "HTTP/1.1 403 Forbidden\r\n\
             Content-Type: application/json; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(resp.as_bytes()).await?;
        stream.flush().await?;
        return Ok(());
    }

    if method == "OPTIONS" {
        let resp = "HTTP/1.1 204 No Content\r\n\
                    Access-Control-Allow-Origin: *\r\n\
                    Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r\n\
                    Access-Control-Allow-Headers: Content-Type, X-Narra-Token\r\n\
                    Connection: close\r\n\r\n";
        stream.write_all(resp.as_bytes()).await?;
        stream.flush().await?;
        return Ok(());
    }

    let header_token = header_value(&raw_req, "x-narra-token").unwrap_or("");
    let query_token = raw_uri
        .split_once('?')
        .and_then(|(_, query)| query.split('&').find_map(|pair| pair.strip_prefix("t=")))
        .unwrap_or("");
    let provided_token = if header_token.is_empty() {
        query_token
    } else {
        header_token
    };

    // Antigravity chat routes (/api/chat, /api/upload, /api/history*) are only
    // reachable while the desktop explicitly enabled Antigravity Chat,
    // and /api/chat requires Antigravity to be connected / running.
    if uri == "/api/chat"
        || uri == "/api/upload"
        || uri == "/api/history"
        || uri.starts_with("/api/history/")
    {
        if !get_companion_chat_enabled() {
            write_json(&mut stream, "403 Forbidden", &json!({ "error": "chat_disabled" })).await?;
            return Ok(());
        }
        if uri == "/api/chat" && !crate::agent::is_hook_installed_internal() {
            write_json(&mut stream, "503 Service Unavailable", &json!({ "error": "antigravity_not_connected" })).await?;
            return Ok(());
        }
    }

    // Pairing gate: once the desktop created a code, calls to chat & sensitive actions
    // (OpenCode, Antigravity Chat/Upload/History, and approval responses) must carry it.
    // The companion hook connection (status, events, diffs) stays open for live observation.
    if uri.starts_with("/api/opencode/")
        || uri == "/api/chat"
        || uri == "/api/models"
        || uri == "/api/upload"
        || uri == "/api/history"
        || uri.starts_with("/api/history/")
        || uri == "/api/respond"
    {
        if !companion_auth::authorized(provided_token) {
            write_json(&mut stream, "401 Unauthorized", &json!({ "error": "unauthorized" })).await?;
            return Ok(());
        }
    }

    if method == "GET" && uri == "/api/status" {
        let state = app.state::<AgentState>();
        let mut view = serde_json::to_value(&agent::get_state_view(&state)).unwrap_or_default();
        if let Some(obj) = view.as_object_mut() {
            obj.insert("language".to_string(), json!(get_companion_language()));
        }
        let body = serde_json::to_string(&view).unwrap_or_else(|_| "{}".to_string());
        let resp = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: application/json; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             Access-Control-Allow-Origin: *\r\n\
             Connection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(resp.as_bytes()).await?;
        stream.flush().await?;
        return Ok(());
    }

    if method == "GET" && uri == "/api/settings" {
        let body = companion_settings().to_string();
        let resp = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: application/json; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             Access-Control-Allow-Origin: *\r\n\
             Connection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(resp.as_bytes()).await?;
        stream.flush().await?;
        return Ok(());
    }

    if method == "POST" && uri == "/api/settings" {
        let body_str = if let Some(pos) = raw_req.find("\r\n\r\n") {
            &raw_req[pos + 4..]
        } else if let Some(pos) = raw_req.find("\n\n") {
            &raw_req[pos + 2..]
        } else {
            ""
        };
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_str) {
            if let Some(outfit) = val.get("outfit").and_then(|v| v.as_str()) {
                set_companion_outfit(outfit);
                // Picked on the phone: keep the desktop's stored choice in sync,
                // otherwise the next desktop start would push the old outfit back.
                let _ = app.emit("settings://companion_outfit", json!({ "outfit": outfit }));
            }
            if let Some(lang) = val.get("language").and_then(|v| v.as_str()) {
                set_companion_language(lang);
            }
            if let Some(turbo) = val.get("turbo").and_then(|v| v.as_bool()) {
                let ask = !turbo;
                crate::agent::apply_ask_permissions(ask, &app);
                let _ = app.emit(
                    "settings://companion_turbo",
                    json!({ "turbo": turbo, "askPermissions": ask }),
                );
            } else if let Some(ask) = val.get("askPermissions").and_then(|v| v.as_bool()) {
                crate::agent::apply_ask_permissions(ask, &app);
                let _ = app.emit(
                    "settings://companion_turbo",
                    json!({ "turbo": !ask, "askPermissions": ask }),
                );
            }
            // Note: `chatEnabled` and `opencodeChatEnabled` are owned exclusively
            // by the desktop settings via Tauri IPC and cannot be toggled remotely.
        }
        let mut body_val = companion_settings();
        if let Some(obj) = body_val.as_object_mut() {
            obj.insert("status".to_string(), json!("ok"));
        }
        let body = body_val.to_string();
        let resp = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: application/json; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             Access-Control-Allow-Origin: *\r\n\
             Connection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(resp.as_bytes()).await?;
        stream.flush().await?;
        return Ok(());
    }

    if method == "GET" && uri == "/api/diff" {        let state = app.state::<AgentState>();
        let ws = state.workspace_dir.lock().unwrap().clone();
        let diff_str = tokio::task::spawn_blocking(move || {
            let mut cmd = std::process::Command::new("git");
            cmd.args(["diff", "HEAD"]);
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x0800_0000);
            }
            if let Some(ref dir) = ws {
                cmd.current_dir(dir);
            }
            if let Ok(out) = cmd.output() {
                if out.status.success() {
                    let s = String::from_utf8_lossy(&out.stdout).to_string();
                    if !s.trim().is_empty() {
                        return s;
                    }
                }
            }
            String::new()
        })
        .await
        .unwrap_or_default();

        let resp = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: text/plain; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             Access-Control-Allow-Origin: *\r\n\
             Connection: close\r\n\r\n{}",
            diff_str.len(),
            diff_str
        );
        stream.write_all(resp.as_bytes()).await?;
        stream.flush().await?;
        return Ok(());
    }

    if method == "GET" && uri == "/api/info" {
        let info = get_companion_info();
        let mut body = serde_json::to_value(&info).unwrap_or_default();
        if let Some(obj) = body.as_object_mut() {
            obj.insert("desktopVersion".to_string(), json!(env!("CARGO_PKG_VERSION")));
            // Lets the phone ask for the pairing code before any API call fails.
            obj.insert("paired".to_string(), json!(companion_auth::is_paired()));
        }
        let body = serde_json::to_string(&body).unwrap_or_else(|_| "{}".to_string());
        let resp = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: application/json; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             Access-Control-Allow-Origin: *\r\n\
             Connection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(resp.as_bytes()).await?;
        stream.flush().await?;
        return Ok(());
    }

    // The phone reports its own build so the desktop can show a real iOS version.
    if method == "POST" && uri == "/api/client" {
        let body_str = if let Some(pos) = raw_req.find("\r\n\r\n") {
            &raw_req[pos + 4..]
        } else if let Some(pos) = raw_req.find("\n\n") {
            &raw_req[pos + 2..]
        } else {
            ""
        };
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_str) {
            let version = val.get("version").and_then(|v| v.as_str()).unwrap_or("").trim();
            let platform = val
                .get("platform")
                .and_then(|v| v.as_str())
                .unwrap_or("ios")
                .trim();
            if !version.is_empty() {
                set_companion_client(platform, version);
            }
        }
        let body = json!({ "status": "ok" }).to_string();
        let resp = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: application/json; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             Access-Control-Allow-Origin: *\r\n\
             Connection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(resp.as_bytes()).await?;
        stream.flush().await?;
        return Ok(());
    }

    if method == "GET" && uri == "/api/events" {
        let initial_header = "HTTP/1.1 200 OK\r\n\
                              Content-Type: text/event-stream\r\n\
                              Cache-Control: no-cache\r\n\
                              Connection: keep-alive\r\n\
                              Access-Control-Allow-Origin: *\r\n\r\n";
        stream.write_all(initial_header.as_bytes()).await?;
        stream.flush().await?;

        let state = app.state::<AgentState>();
        let ask = crate::agent::ask_permissions();
        let mut init_msg = json!({
            "type": "init",
            "state": agent::get_state_view(&state),
            "language": get_companion_language(),
            "chatEnabled": get_companion_chat_enabled(),
            "opencodeChatEnabled": get_companion_opencode_chat_enabled(),
            "askPermissions": ask,
            "turbo": !ask,
        });
        if let Some(outfit) = get_companion_outfit() {
            init_msg["outfit"] = json!(outfit);
        }
        let init_msg = init_msg.to_string();

        let init_frame = format!("data: {}\n\n", init_msg);
        stream.write_all(init_frame.as_bytes()).await?;
        stream.flush().await?;

        let mut rx = get_broadcast_tx().subscribe();
        let mut interval = tokio::time::interval(Duration::from_secs(15));

        loop {
            tokio::select! {
                msg = rx.recv() => {
                    match msg {
                        Ok(payload) => {
                            let frame = format!("data: {}\n\n", payload);
                            if stream.write_all(frame.as_bytes()).await.is_err() {
                                break;
                            }
                            if stream.flush().await.is_err() {
                                break;
                            }
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => break,
                    }
                }
                _ = interval.tick() => {
                    if stream.write_all(b": ping\n\n").await.is_err() {
                        break;
                    }
                    if stream.flush().await.is_err() {
                        break;
                    }
                }
            }
        }
        return Ok(());
    }

    if method == "GET" && uri == "/api/models" {
        let models = crate::agent_chat::get_available_models_internal();
        let body = serde_json::to_string(&models).unwrap_or_else(|_| "[]".to_string());
        let resp = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: application/json; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             Access-Control-Allow-Origin: *\r\n\
             Connection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(resp.as_bytes()).await?;
        stream.flush().await?;
        return Ok(());
    }

    if method == "GET" && (uri == "/api/history" || uri.starts_with("/api/history")) {
        if uri.starts_with("/api/history/") {
            let id = uri.trim_start_matches("/api/history/");
            let msgs = crate::agent_chat::get_conversation_messages_internal(id);
            let body = serde_json::to_string(&msgs).unwrap_or_else(|_| "[]".to_string());
            let resp = format!(
                "HTTP/1.1 200 OK\r\n\
                 Content-Type: application/json; charset=utf-8\r\n\
                 Content-Length: {}\r\n\
                 Access-Control-Allow-Origin: *\r\n\
                 Connection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(resp.as_bytes()).await?;
            stream.flush().await?;
            return Ok(());
        } else {
            let query = raw_uri.split("q=").nth(1).and_then(|q| q.split('&').next());
            let list = crate::agent_chat::list_conversations_internal(query);
            let body = serde_json::to_string(&list).unwrap_or_else(|_| "[]".to_string());
            let resp = format!(
                "HTTP/1.1 200 OK\r\n\
                 Content-Type: application/json; charset=utf-8\r\n\
                 Content-Length: {}\r\n\
                 Access-Control-Allow-Origin: *\r\n\
                 Connection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(resp.as_bytes()).await?;
            stream.flush().await?;
            return Ok(());
        }
    }

    if method == "DELETE" && uri.starts_with("/api/history/") {
        let id = uri.trim_start_matches("/api/history/");
        let (status, body) = match crate::agent_chat::delete_conversation_internal(id) {
            Ok(true) => ("200 OK", json!({ "ok": true }).to_string()),
            Ok(false) => (
                "404 Not Found",
                json!({ "ok": false, "error": "Conversation not found" }).to_string(),
            ),
            Err(e) => (
                "500 Internal Server Error",
                json!({ "ok": false, "error": e }).to_string(),
            ),
        };
        let resp = format!(
            "HTTP/1.1 {}\r\n\
             Content-Type: application/json; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             Access-Control-Allow-Origin: *\r\n\
             Connection: close\r\n\r\n{}",
            status,
            body.len(),
            body
        );
        stream.write_all(resp.as_bytes()).await?;
        stream.flush().await?;
        return Ok(());
    }

    if method == "POST" && uri == "/api/chat" {
        let body_str = if let Some(pos) = raw_req.find("\r\n\r\n") {
            &raw_req[pos + 4..]
        } else if let Some(pos) = raw_req.find("\n\n") {
            &raw_req[pos + 2..]
        } else {
            ""
        };

        #[derive(Deserialize)]
        struct ChatPayload {
            prompt: String,
            model: Option<String>,
            #[serde(rename = "conversationId")]
            conversation_id: Option<String>,
            attachments: Option<Vec<String>>,
        }

        if let Ok(payload) = serde_json::from_str::<ChatPayload>(body_str) {
            let app_clone = app.clone();
            tokio::spawn(async move {
                let state = app_clone.state::<AgentState>();
                let _ = crate::agent_chat::send_chat_internal(
                    &app_clone,
                    &state,
                    payload.prompt,
                    payload.model,
                    payload.conversation_id,
                    payload.attachments,
                )
                .await;
            });

            let body = json!({ "status": "ok", "message": "Chat initiated" }).to_string();
            let resp = format!(
                "HTTP/1.1 200 OK\r\n\
                 Content-Type: application/json; charset=utf-8\r\n\
                 Content-Length: {}\r\n\
                 Access-Control-Allow-Origin: *\r\n\
                 Connection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(resp.as_bytes()).await?;
            stream.flush().await?;
            return Ok(());
        } else {
            let body = json!({ "status": "error", "message": "invalid json payload" }).to_string();
            let resp = format!(
                "HTTP/1.1 400 Bad Request\r\n\
                 Content-Type: application/json; charset=utf-8\r\n\
                 Content-Length: {}\r\n\
                 Access-Control-Allow-Origin: *\r\n\
                 Connection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(resp.as_bytes()).await?;
            stream.flush().await?;
            return Ok(());
        }
    }

    if method == "POST" && uri == "/api/upload" {
        let body_str = if let Some(pos) = raw_req.find("\r\n\r\n") {
            &raw_req[pos + 4..]
        } else if let Some(pos) = raw_req.find("\n\n") {
            &raw_req[pos + 2..]
        } else {
            ""
        };

        #[derive(Deserialize)]
        struct UploadPayload {
            name: String,
            #[serde(rename = "base64Data")]
            base64_data: String,
            #[serde(rename = "conversationId")]
            conversation_id: Option<String>,
        }

        let res = if let Ok(payload) = serde_json::from_str::<UploadPayload>(body_str) {
            match crate::agent_chat::agent_save_temp_attachment(
                payload.name,
                payload.base64_data,
                payload.conversation_id,
            ) {
                Ok(path) => json!({ "status": "ok", "path": path }),
                Err(err) => json!({ "status": "error", "message": err }),
            }
        } else {
            json!({ "status": "error", "message": "invalid upload payload" })
        };

        let body = res.to_string();
        let resp = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: application/json; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             Access-Control-Allow-Origin: *\r\n\
             Connection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(resp.as_bytes()).await?;
        stream.flush().await?;
        return Ok(());
    }

    if method == "POST" && uri == "/api/respond" {
        let body_str = if let Some(pos) = raw_req.find("\r\n\r\n") {
            &raw_req[pos + 4..]
        } else if let Some(pos) = raw_req.find("\n\n") {
            &raw_req[pos + 2..]
        } else {
            ""
        };

        let res = if let Ok(payload) = serde_json::from_str::<RespondPayload>(body_str) {
            let state = app.state::<AgentState>();
            let decision = if !payload.allow {
                "deny"
            } else if payload.always {
                "always"
            } else {
                "allow"
            };
            let ok = agent::respond_approval_internal(&payload.id, decision, &state, &app);
            println!(
                "[companion] Approval responded: id={} decision={}",
                payload.id, decision
            );
            json!({ "status": "ok", "resolved": ok })
        } else {
            json!({ "status": "error", "message": "invalid json payload" })
        };

        let body = res.to_string();
        let resp = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: application/json; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             Access-Control-Allow-Origin: *\r\n\
             Connection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(resp.as_bytes()).await?;
        stream.flush().await?;
        return Ok(());
    }

    // OpenCode passthrough. The desktop talks to OpenCode itself (Rust module
    // `opencode_api`), so the phone never needs the OpenCode password: it asks
    // the notch, which already holds the pairing token gate above.
    if uri == "/api/opencode/status" && method == "GET" {
        let value = crate::opencode_api::opencode_status().await;
        write_json(&mut stream, "200 OK", &value).await?;
        return Ok(());
    }

    if uri == "/api/opencode/sessions" && method == "GET" {
        let search = query_param(raw_uri, "q");
        let limit = query_param(raw_uri, "limit").and_then(|v| v.parse::<u32>().ok());
        let value = match crate::opencode_api::opencode_sessions(search, limit).await {
            Ok(value) => value,
            Err(error) => json!({ "error": error }),
        };
        let status = if value.get("error").is_some() {
            "502 Bad Gateway"
        } else {
            "200 OK"
        };
        write_json(&mut stream, status, &value).await?;
        return Ok(());
    }

    if uri == "/api/opencode/sessions" && method == "POST" {
        #[derive(Deserialize)]
        struct NewSessionPayload {
            #[serde(default)]
            title: Option<String>,
            #[serde(default)]
            agent: Option<String>,
            #[serde(default)]
            model: Option<serde_json::Value>,
            #[serde(default)]
            directory: Option<String>,
        }
        let value = match serde_json::from_str::<NewSessionPayload>(body_of(&raw_req)) {
            Ok(payload) => match crate::opencode_api::opencode_new_session(
                payload.title,
                payload.agent,
                payload.model,
                payload.directory,
            )
            .await
            {
                Ok(value) => value,
                Err(error) => json!({ "error": error }),
            },
            Err(_) => json!({ "error": "invalid json payload" }),
        };
        let status = if value.get("error").is_some() {
            "400 Bad Request"
        } else {
            "200 OK"
        };
        write_json(&mut stream, status, &value).await?;
        return Ok(());
    }

    if uri == "/api/opencode/agents" && method == "GET" {
        let value = match crate::opencode_api::opencode_agents().await {
            Ok(value) => value,
            Err(error) => json!({ "error": error }),
        };
        let status = if value.get("error").is_some() {
            "502 Bad Gateway"
        } else {
            "200 OK"
        };
        write_json(&mut stream, status, &value).await?;
        return Ok(());
    }

    if uri == "/api/opencode/models" && method == "GET" {
        let value = match crate::opencode_api::opencode_models().await {
            Ok(value) => value,
            Err(error) => json!({ "error": error }),
        };
        let status = if value.get("error").is_some() {
            "502 Bad Gateway"
        } else {
            "200 OK"
        };
        write_json(&mut stream, status, &value).await?;
        return Ok(());
    }

    if let Some(rest) = uri.strip_prefix("/api/opencode/sessions/") {
        if let Some(id) = rest.strip_suffix("/messages") {
            if method == "GET" {
                let limit = query_param(raw_uri, "limit").and_then(|v| v.parse::<u32>().ok());
                let value = match crate::opencode_api::opencode_session_messages(id.to_string(), limit).await {
                    Ok(value) => value,
                    Err(error) => json!({ "error": error }),
                };
                let status = if value.get("error").is_some() {
                    "502 Bad Gateway"
                } else {
                    "200 OK"
                };
                write_json(&mut stream, status, &value).await?;
                return Ok(());
            }
        } else if let Some(id) = rest.strip_suffix("/agent") {
            if method == "POST" {
                #[derive(Deserialize)]
                struct AgentPayload {
                    agent: String,
                }
                let value = match serde_json::from_str::<AgentPayload>(body_of(&raw_req)) {
                    Ok(payload) if !payload.agent.trim().is_empty() => {
                        match crate::opencode_api::opencode_switch_agent(id.to_string(), payload.agent).await {
                            Ok(value) => value,
                            Err(error) => json!({ "error": error }),
                        }
                    }
                    _ => json!({ "error": "invalid json payload" }),
                };
                let status = if value.get("error").is_some() {
                    "400 Bad Request"
                } else {
                    "200 OK"
                };
                write_json(&mut stream, status, &value).await?;
                return Ok(());
            }
        } else if let Some(id) = rest.strip_suffix("/model") {
            if method == "POST" {
                #[derive(Deserialize)]
                struct ModelPayload {
                    model: serde_json::Value,
                }
                let value = match serde_json::from_str::<ModelPayload>(body_of(&raw_req)) {
                    Ok(payload) if payload.model.is_object() => {
                        match crate::opencode_api::opencode_switch_model(id.to_string(), payload.model).await {
                            Ok(value) => value,
                            Err(error) => json!({ "error": error }),
                        }
                    }
                    _ => json!({ "error": "invalid json payload" }),
                };
                let status = if value.get("error").is_some() {
                    "400 Bad Request"
                } else {
                    "200 OK"
                };
                write_json(&mut stream, status, &value).await?;
                return Ok(());
            }
        } else if let Some(id) = rest.strip_suffix("/prompt") {
            if method == "POST" {
                #[derive(Deserialize)]
                struct PromptPayload {
                    text: String,
                }
                let value = match serde_json::from_str::<PromptPayload>(body_of(&raw_req)) {
                    Ok(payload) if !payload.text.trim().is_empty() => {
                        match crate::opencode_api::opencode_prompt(id.to_string(), payload.text).await
                        {
                            Ok(value) => value,
                            Err(error) => json!({ "error": error }),
                        }
                    }
                    _ => json!({ "error": "invalid json payload" }),
                };
                let status = if value.get("error").is_some() {
                    "400 Bad Request"
                } else {
                    "200 OK"
                };
                write_json(&mut stream, status, &value).await?;
                return Ok(());
            }
        } else if let Some(id) = rest.strip_suffix("/interrupt") {
            if method == "POST" {
                let value = match crate::opencode_api::opencode_interrupt(id.to_string()).await {
                    Ok(value) => value,
                    Err(error) => json!({ "error": error }),
                };
                let status = if value.get("error").is_some() {
                    "502 Bad Gateway"
                } else {
                    "200 OK"
                };
                write_json(&mut stream, status, &value).await?;
                return Ok(());
            }
        }
    }


    if method == "GET" {
        let clean_path = uri.trim_start_matches('/');
        let (file_data, content_type) = if clean_path.is_empty() || clean_path == "index.html" {
            (
                DistAssets::get("index.html"),
                "text/html; charset=utf-8".to_string(),
            )
        } else if clean_path == "manifest.json" {
            let manifest = json!({
                "name": "Narra Notch Companion",
                "short_name": "Notch",
                "id": "/",
                "scope": "/",
                "start_url": "/",
                "display": "standalone",
                "orientation": "portrait-primary",
                "background_color": "#000000",
                "theme_color": "#000000",
                "icons": [
                    {
                        "src": "/icons/icon-192.png",
                        "sizes": "192x192",
                        "type": "image/png",
                        "purpose": "any"
                    },
                    {
                        "src": "/icons/icon-512.png",
                        "sizes": "512x512",
                        "type": "image/png",
                        "purpose": "any"
                    },
                    {
                        "src": "/icons/maskable-512.png",
                        "sizes": "512x512",
                        "type": "image/png",
                        "purpose": "maskable"
                    }
                ]
            })
            .to_string();
            let resp = format!(
                "HTTP/1.1 200 OK\r\n\
                 Content-Type: application/manifest+json; charset=utf-8\r\n\
                 Content-Length: {}\r\n\
                 Access-Control-Allow-Origin: *\r\n\
                 Connection: close\r\n\r\n{}",
                manifest.len(),
                manifest
            );
            stream.write_all(resp.as_bytes()).await?;
            stream.flush().await?;
            return Ok(());
        } else if clean_path == "sw.js" {
            let sw_data = DistAssets::get("sw.js");
            if let Some(file) = sw_data {
                let resp = format!(
                    "HTTP/1.1 200 OK\r\n\
                     Content-Type: application/javascript; charset=utf-8\r\n\
                     Service-Worker-Allowed: /\r\n\
                     Cache-Control: no-cache\r\n\
                     Content-Length: {}\r\n\
                     Access-Control-Allow-Origin: *\r\n\
                     Connection: close\r\n\r\n",
                    file.data.len()
                );
                stream.write_all(resp.as_bytes()).await?;
                stream.write_all(&file.data).await?;
                stream.flush().await?;
                return Ok(());
            }
            (None, "application/javascript; charset=utf-8".to_string())
        } else if clean_path == "icon.png" {
            let header = format!(
                "HTTP/1.1 200 OK\r\n\
                 Content-Type: image/png\r\n\
                 Content-Length: {}\r\n\
                 Cache-Control: public, max-age=86400\r\n\
                 Access-Control-Allow-Origin: *\r\n\
                 Connection: close\r\n\r\n",
                ICON_BYTES.len()
            );
            stream.write_all(header.as_bytes()).await?;
            stream.write_all(ICON_BYTES).await?;
            stream.flush().await?;
            return Ok(());
        } else if let Some(file) = DistAssets::get(clean_path) {
            let guess = mime_guess::from_path(clean_path).first_or_octet_stream();
            (Some(file), guess.to_string())
        } else {
            // SPA fallback to index.html
            (
                DistAssets::get("index.html"),
                "text/html; charset=utf-8".to_string(),
            )
        };

        if let Some(file) = file_data {
            let cache_header = if clean_path.is_empty() || clean_path == "index.html" || clean_path == "sw.js" {
                "no-cache, no-store, must-revalidate"
            } else if clean_path.starts_with("assets/") {
                "public, max-age=31536000, immutable"
            } else {
                "public, max-age=3600"
            };

            let resp = format!(
                "HTTP/1.1 200 OK\r\n\
                 Content-Type: {}\r\n\
                 Content-Length: {}\r\n\
                 Cache-Control: {}\r\n\
                 Access-Control-Allow-Origin: *\r\n\
                 Connection: close\r\n\r\n",
                content_type,
                file.data.len(),
                cache_header
            );
            stream.write_all(resp.as_bytes()).await?;
            stream.write_all(&file.data).await?;
            stream.flush().await?;
            return Ok(());
        }
    }

    let not_found = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    stream.write_all(not_found.as_bytes()).await?;
    stream.flush().await?;

    Ok(())
}

#[tauri::command]
pub fn agent_get_companion_info() -> CompanionInfo {
    get_companion_info()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_end_accepts_both_line_endings() {
        assert_eq!(header_end(b"POST / HTTP/1.1\r\nA: b\r\n\r\n{}"), Some(25));
        assert_eq!(header_end(b"POST / HTTP/1.1\nA: b\n\n{}"), Some(22));
        assert_eq!(header_end(b"POST / HTTP/1.1\r\nA: b\r\n"), None);
    }

    #[test]
    fn content_length_is_case_insensitive() {
        assert_eq!(
            content_length(b"POST / HTTP/1.1\r\ncontent-length: 17\r\n\r\n"),
            Some(17)
        );
        assert_eq!(content_length(b"GET / HTTP/1.1\r\n\r\n"), None);
    }

    #[test]
    fn body_starts_after_the_blank_line() {
        let request = "POST / HTTP/1.1\r\nContent-Length: 2\r\n\r\n{}";
        assert_eq!(body_of(request), "{}");
        assert_eq!(body_of("GET / HTTP/1.1\r\n\r\n"), "");
    }

    #[test]
    fn origin_allowlist_blocks_external_websites() {
        assert!(is_allowed_origin(None));
        assert!(is_allowed_origin(Some("capacitor://localhost")));
        assert!(is_allowed_origin(Some("http://localhost")));
        assert!(is_allowed_origin(Some("https://localhost")));
        assert!(is_allowed_origin(Some("http://localhost:1420")));
        assert!(is_allowed_origin(Some("http://127.0.0.1:1421")));
        assert!(is_allowed_origin(Some("http://192.168.1.42:1421")));
        assert!(is_allowed_origin(Some("http://10.0.0.5:1421")));
        assert!(!is_allowed_origin(Some("https://evil.example.com")));
        assert!(!is_allowed_origin(Some("http://8.8.8.8:1421")));
    }
}
