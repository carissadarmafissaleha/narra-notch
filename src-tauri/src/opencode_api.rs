//! Minimal OpenCode client for the notch.
//!
//! The plugin pipe (`agent.rs`) only delivers approvals and tool activity. To
//! show what OpenCode actually said, and to answer it, the notch reads the same
//! HTTP API the OpenCode web UI uses:
//!
//! `http://127.0.0.1:28894` (Windows default), password from
//! `~/.config/opencode/service.json`, HTTP Basic auth with user `opencode`.
//!
//! Only the handful of endpoints the notch needs are wrapped here. Every call
//! re-reads `service.json`, so `opencode service set port|password` and a
//! restart are picked up without restarting the notch.

use std::path::PathBuf;
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::agent::AgentState;

/// Where OpenCode keeps its managed-service config (`hostname`, `password`, and
/// `port` when the user pinned one).
fn config_dir() -> Option<PathBuf> {
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        if !xdg.is_empty() {
            return Some(PathBuf::from(xdg).join("opencode"));
        }
    }
    let home = std::env::var("USERPROFILE")
        .ok()
        .or_else(|| std::env::var("HOME").ok())?;
    Some(PathBuf::from(home).join(".config").join("opencode"))
}

#[derive(Debug, Deserialize)]
struct ServiceConfig {
    #[serde(default)]
    hostname: String,
    #[serde(default)]
    password: String,
    #[serde(default)]
    port: Option<u16>,
}

fn service_config() -> Option<ServiceConfig> {
    let raw = std::fs::read_to_string(config_dir()?.join("service.json")).ok()?;
    serde_json::from_str(&raw).ok()
}

/// Default managed-service port. Current OpenCode builds fold the channel port
/// below the Windows dynamic range, so both platforms end up on 28894; 49374 is
/// the pre-2.2 default on macOS/Linux.
fn default_port() -> u16 {
    if cfg!(windows) {
        28894
    } else {
        49374
    }
}

/// `127.0.0.1` for wildcard/localhost hosts, otherwise the configured host.
fn host_for_client(hostname: &str) -> &str {
    match hostname {
        "" | "0.0.0.0" | "::" | "[::]" | "localhost" => "127.0.0.1",
        other => other,
    }
}

fn base_url(config: &ServiceConfig) -> String {
    format!(
        "http://{}:{}",
        host_for_client(&config.hostname),
        config.port.unwrap_or_else(default_port)
    )
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

async fn request(method: reqwest::Method, path: &str, body: Option<Value>) -> Result<Value, String> {
    let config = service_config().ok_or("OpenCode is not installed for this user")?;
    let mut req = client()?.request(method, format!("{}{}", base_url(&config), path));
    // OpenCode 2 requires Basic auth whenever a password is configured.
    if !config.password.is_empty() {
        req = req.basic_auth("opencode", Some(&config.password));
    }
    if let Some(body) = body {
        req = req.json(&body);
    }

    let res = req.send().await.map_err(|e| {
        if e.is_connect() {
            "OpenCode is not running".to_string()
        } else {
            e.to_string()
        }
    })?;

    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("OpenCode rejected the password in service.json".to_string());
    }
    if !status.is_success() {
        return Err(format!("OpenCode returned {}", status.as_u16()));
    }
    if text.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(&text).map_err(|e| format!("OpenCode sent invalid JSON: {}", e))
}

/// Server identity plus whether the notch can reach it.
#[tauri::command]
pub async fn opencode_status() -> Value {
    match request(reqwest::Method::GET, "/api/info", None).await {
        Ok(info) => json!({
            "connected": true,
            "version": info.get("version").cloned().unwrap_or(Value::Null),
            "url": service_config().map(|c| base_url(&c)).unwrap_or_default(),
        }),
        Err(error) => json!({ "connected": false, "error": error }),
    }
}

/// Recent sessions, newest first. `search` matches OpenCode's own filter.
#[tauri::command]
pub async fn opencode_sessions(search: Option<String>, limit: Option<u32>) -> Result<Value, String> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    let mut path = format!("/api/session?limit={}", limit);
    if let Some(search) = search.filter(|s| !s.trim().is_empty()) {
        path.push_str(&format!("&search={}", encode(&search)));
    }
    let body = request(reqwest::Method::GET, &path, None).await?;
    Ok(body.get("data").cloned().unwrap_or_else(|| json!([])))
}

/// Transcript of one session, oldest message first.
///
/// OpenCode pages from the newest message, so ask for `desc` and flip the page:
/// a long session must still show what the agent said last.
#[tauri::command]
pub async fn opencode_session_messages(
    session_id: String,
    limit: Option<u32>,
) -> Result<Value, String> {
    let limit = limit.unwrap_or(80).clamp(1, 200);
    let path = format!(
        "/api/session/{}/message?order=desc&limit={}",
        encode(&session_id),
        limit
    );
    let body = request(reqwest::Method::GET, &path, None).await?;
    let mut data = body
        .get("data")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    data.reverse();
    Ok(Value::Array(data))
}

/// Agents a session can switch to. Subagents and hidden helpers are dropped:
/// the notch only offers what a person would pick in OpenCode itself.
#[tauri::command]
pub async fn opencode_agents() -> Result<Value, String> {
    let body = request(reqwest::Method::GET, "/api/agent", None).await?;
    let list = body
        .get("data")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let agents: Vec<Value> = list
        .iter()
        .filter(|agent| agent.get("hidden").and_then(Value::as_bool) != Some(true))
        .filter(|agent| agent.get("mode").and_then(Value::as_str) != Some("subagent"))
        .map(|agent| {
            json!({
                "id": agent.get("id").cloned().unwrap_or(Value::Null),
                "name": agent.get("name").cloned().unwrap_or(Value::Null),
                "description": agent.get("description").cloned().unwrap_or(Value::Null),
            })
        })
        .filter(|agent| !agent["id"].is_null())
        .collect();
    Ok(Value::Array(agents))
}

/// Chat models that can run a session, slimmed down for the picker.
#[tauri::command]
pub async fn opencode_models() -> Result<Value, String> {
    let body = request(reqwest::Method::GET, "/api/model", None).await?;
    let list = body
        .get("data")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let models: Vec<Value> = list
        .iter()
        .filter(|model| model.get("enabled").and_then(Value::as_bool) != Some(false))
        .filter_map(|model| {
            // `modelID` is the id a session stores; `id` is the provider-prefixed
            // display id and only a fallback for older builds.
            let id = model
                .get("modelID")
                .or_else(|| model.get("id"))
                .filter(|value| value.as_str().is_some_and(|text| !text.is_empty()))?
                .clone();
            let provider = model
                .get("providerID")
                .filter(|value| value.as_str().is_some_and(|text| !text.is_empty()))?
                .clone();
            Some(json!({
                "id": id,
                "providerID": provider,
                "name": model.get("name").cloned().unwrap_or(Value::Null),
            }))
        })
        .collect();
    Ok(Value::Array(models))
}

/// Start an empty session. `model` is a `{ id, providerID }` reference, and
/// `directory` keeps the new session in the same project as the one on screen.
#[tauri::command]
pub async fn opencode_new_session(
    title: Option<String>,
    agent: Option<String>,
    model: Option<Value>,
    directory: Option<String>,
) -> Result<Value, String> {
    let mut payload = serde_json::Map::new();
    if let Some(title) = title.filter(|value| !value.trim().is_empty()) {
        payload.insert("title".into(), json!(title));
    }
    if let Some(agent) = agent.filter(|value| !value.trim().is_empty()) {
        payload.insert("agent".into(), json!(agent));
    }
    if let Some(model) = model.filter(Value::is_object) {
        payload.insert("model".into(), model);
    }
    if let Some(directory) = directory.filter(|value| !value.trim().is_empty()) {
        payload.insert("location".into(), json!({ "directory": directory }));
    }
    let body = request(
        reqwest::Method::POST,
        "/api/session",
        Some(Value::Object(payload)),
    )
    .await?;
    Ok(body.get("data").cloned().unwrap_or(body))
}

/// Switch the agent used by the next turn.
#[tauri::command]
pub async fn opencode_switch_agent(session_id: String, agent: String) -> Result<Value, String> {
    let path = format!("/api/session/{}/agent", encode(&session_id));
    request(reqwest::Method::POST, &path, Some(json!({ "agent": agent }))).await
}

/// Switch the model used by the next turn. `model` is a `{ id, providerID }` ref.
#[tauri::command]
pub async fn opencode_switch_model(session_id: String, model: Value) -> Result<Value, String> {
    let path = format!("/api/session/{}/model", encode(&session_id));
    request(
        reqwest::Method::POST,
        &path,
        Some(json!({ "model": model })),
    )
    .await
}

/// Send a prompt into an existing session.
#[tauri::command]
pub async fn opencode_prompt(session_id: String, text: String) -> Result<Value, String> {
    let path = format!("/api/session/{}/prompt", encode(&session_id));
    request(reqwest::Method::POST, &path, Some(json!({ "text": text }))).await
}

/// Stop the current run of a session.
#[tauri::command]
pub async fn opencode_interrupt(session_id: String) -> Result<Value, String> {
    let path = format!("/api/session/{}/interrupt", encode(&session_id));
    request(reqwest::Method::POST, &path, None).await
}

/// Session id the plugin last reported, when OpenCode is the active agent.
pub fn active_session(state: &AgentState) -> Option<String> {
    let source = state.source.lock().ok()?.clone();
    if source != "opencode" {
        return None;
    }
    state.conversation_id.lock().ok()?.as_ref().cloned()
}

/// Small percent-encoder for path/query values (ids and search text only).
fn encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wildcard_hosts_use_loopback() {
        assert_eq!(host_for_client("0.0.0.0"), "127.0.0.1");
        assert_eq!(host_for_client("::"), "127.0.0.1");
        assert_eq!(host_for_client(""), "127.0.0.1");
        assert_eq!(host_for_client("localhost"), "127.0.0.1");
        assert_eq!(host_for_client("192.168.1.25"), "192.168.1.25");
    }

    #[test]
    fn session_ids_are_percent_encoded() {
        assert_eq!(encode("ses_abc123"), "ses_abc123");
        assert_eq!(encode("a b&c"), "a%20b%26c");
    }

    #[test]
    fn pinned_port_wins_over_the_default() {
        let pinned = ServiceConfig {
            hostname: "0.0.0.0".into(),
            password: String::new(),
            port: Some(49374),
        };
        assert_eq!(base_url(&pinned), "http://127.0.0.1:49374");

        let generated = ServiceConfig {
            hostname: "0.0.0.0".into(),
            password: String::new(),
            port: None,
        };
        assert!(base_url(&generated).ends_with(&format!(":{}", default_port())));
    }
}
