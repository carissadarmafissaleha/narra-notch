//! Antigravity, OpenCode & AI Agent lifecycle hook integration for narra-notch.
//!
//! Provides:
//! 1. Windows Named Pipe server (`\\.\pipe\narra_notch_agent`) for real-time IPC.
//! 2. CLI Hook Runner (`narra-notch.exe --agent-hook <Event>`) that pipes Antigravity
//!    stdin/stdout directly into the Tauri GUI.
//! 3. Interactive Quick Approval for PreToolUse (Allow/Always/Deny tool calls).
//! 4. Automatic registration/unregistration in `~/.gemini/config/hooks.json`.
//! 5. OpenCode V2 plugin installed at `~/.config/opencode/plugins/narra-notch.ts`.

use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

const PIPE_NAME: &str = r"\\.\pipe\narra_notch_agent";

/// Marker written at the top of the generated OpenCode plugin. Used to decide
/// whether the file is ours before overwriting or deleting it.
const OPENCODE_PLUGIN_MARKER: &str = "@narra-notch-plugin";
const OPENCODE_PLUGIN_SOURCE: &str = include_str!("opencode_plugin.ts");

/// Ask OpenCode for shell/edit approvals. The plugin injects session-scoped
/// `ask` rules only while this is on, so no user config is needed.
static ASK_PERMISSIONS: AtomicBool = AtomicBool::new(true);

pub fn set_ask_permissions(enabled: bool) {
    ASK_PERMISSIONS.store(enabled, Ordering::Relaxed);
}

pub fn ask_permissions() -> bool {
    ASK_PERMISSIONS.load(Ordering::Relaxed)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    pub name: String,
    pub args: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingApproval {
    pub id: String,
    pub tool_name: String,
    pub command: Option<String>,
    pub details: String,
    pub conversation_id: Option<String>,
    pub step_idx: Option<i64>,
    pub created_at: u64,
    /// "antigravity" | "opencode" — who asked. The notch auto-approves Antigravity
    /// requests when its agent tool is off, but never OpenCode's.
    #[serde(default)]
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStateView {
    pub active: bool,
    pub status: String, // "idle" | "thinking" | "tool_running" | "waiting_approval" | "finished"
    pub conversation_id: Option<String>,
    pub last_input: Option<String>,
    pub current_tool: Option<String>,
    pub current_tool_category: Option<String>, // "read" | "edit" | "bash" | null
    pub has_read: bool,
    pub has_edit: bool,
    pub has_bash: bool,
    pub has_done: bool,
    pub pending_approval: Option<PendingApproval>,
    pub is_hook_installed: bool,
    pub is_opencode_hook_installed: bool,
    /// "antigravity" | "opencode" — which agent emitted the latest event.
    pub source: String,
}

pub struct AgentState {
    pub active: Mutex<bool>,
    pub status: Mutex<String>,
    pub conversation_id: Mutex<Option<String>>,
    pub last_input: Mutex<Option<String>>,
    pub current_tool: Mutex<Option<String>>,
    pub current_tool_category: Mutex<Option<String>>,
    pub has_read: Mutex<bool>,
    pub has_edit: Mutex<bool>,
    pub has_bash: Mutex<bool>,
    pub has_done: Mutex<bool>,
    pub pending: Mutex<Option<PendingApproval>>,
    pub approval_tx: Mutex<HashMap<String, tokio::sync::oneshot::Sender<String>>>,
    /// In-flight relays keyed by the caller's request key. The OpenCode plugin is
    /// loaded twice per process (two locations), so the same approval arrives
    /// twice; duplicates wait here instead of opening a second prompt.
    pub approval_relays: Mutex<HashMap<String, tokio::sync::broadcast::Sender<String>>>,
    /// Decisions of relays that finished a moment ago, for late duplicates.
    pub approval_recent: Mutex<HashMap<String, (String, std::time::Instant)>>,
    pub workspace_dir: Mutex<Option<String>>,
    pub source: Mutex<String>,
}

impl Default for AgentState {
    fn default() -> Self {
        Self {
            active: Mutex::new(false),
            status: Mutex::new("idle".to_string()),
            conversation_id: Mutex::new(None),
            last_input: Mutex::new(None),
            current_tool: Mutex::new(None),
            current_tool_category: Mutex::new(None),
            has_read: Mutex::new(false),
            has_edit: Mutex::new(false),
            has_bash: Mutex::new(false),
            has_done: Mutex::new(false),
            pending: Mutex::new(None),
            approval_tx: Mutex::new(HashMap::new()),
            approval_relays: Mutex::new(HashMap::new()),
            approval_recent: Mutex::new(HashMap::new()),
            workspace_dir: Mutex::new(std::env::current_dir().ok().map(|p| p.to_string_lossy().to_string())),
            source: Mutex::new("antigravity".to_string()),
        }
    }
}

/// Helper to get current epoch millis
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Helper to locate ~/.gemini/config/hooks.json
fn hooks_config_path() -> Option<PathBuf> {
    let user_profile = std::env::var("USERPROFILE").ok()?;
    let path = PathBuf::from(user_profile)
        .join(".gemini")
        .join("config")
        .join("hooks.json");
    Some(path)
}

/// Export state view to frontend
pub fn get_state_view(state: &AgentState) -> AgentStateView {
    AgentStateView {
        active: *state.active.lock().unwrap(),
        status: state.status.lock().unwrap().clone(),
        conversation_id: state.conversation_id.lock().unwrap().clone(),
        last_input: state.last_input.lock().unwrap().clone(),
        current_tool: state.current_tool.lock().unwrap().clone(),
        current_tool_category: state.current_tool_category.lock().unwrap().clone(),
        has_read: *state.has_read.lock().unwrap(),
        has_edit: *state.has_edit.lock().unwrap(),
        has_bash: *state.has_bash.lock().unwrap(),
        has_done: *state.has_done.lock().unwrap(),
        pending_approval: state.pending.lock().unwrap().clone(),
        is_hook_installed: is_hook_installed_internal(),
        is_opencode_hook_installed: is_opencode_hook_installed_internal(),
        source: state.source.lock().unwrap().clone(),
    }
}

fn is_hook_installed_internal() -> bool {
    let Some(path) = hooks_config_path() else { return false; };
    if !path.exists() {
        return false;
    }
    let Ok(content) = fs::read_to_string(&path) else { return false; };
    let Ok(v) = serde_json::from_str::<Value>(&content) else { return false; };
    let Some(nn) = v.get("narra-notch") else { return false; };
    if nn.get("enabled").and_then(|e| e.as_bool()) == Some(false) {
        return false;
    }
    nn.get("PreToolUse").is_some()
}

/// OpenCode config directory: `$XDG_CONFIG_HOME/opencode` or `~/.config/opencode`.
fn opencode_config_dir() -> Option<PathBuf> {
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        if !xdg.trim().is_empty() {
            return Some(PathBuf::from(xdg).join("opencode"));
        }
    }
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    Some(PathBuf::from(home).join(".config").join("opencode"))
}

fn opencode_plugin_path() -> Option<PathBuf> {
    Some(opencode_config_dir()?.join("plugins").join("narra-notch.ts"))
}

fn is_opencode_plugin_content(content: &str) -> bool {
    content.lines().take(3).any(|line| line.contains(OPENCODE_PLUGIN_MARKER))
}

fn is_opencode_hook_installed_internal() -> bool {
    let Some(path) = opencode_plugin_path() else { return false; };
    let Ok(content) = fs::read_to_string(&path) else { return false; };
    is_opencode_plugin_content(&content)
}

// Helper to extract tool name flexibly from Antigravity hook payload
fn extract_tool_name(payload: &Value) -> String {
    payload
        .pointer("/toolCall/name")
        .or_else(|| payload.pointer("/tool_call/name"))
        .or_else(|| payload.get("toolName"))
        .or_else(|| payload.get("tool_name"))
        .or_else(|| payload.get("tool"))
        .and_then(|v| v.as_str())
        .unwrap_or("tool")
        .to_string()
}

// Helper to extract target (file name, command, or query) for clean ticker UI
fn extract_tool_target(payload: &Value) -> Option<String> {
    // 1. Path
    let path = payload
        .pointer("/toolCall/args/Path")
        .or_else(|| payload.pointer("/tool_call/args/Path"))
        .or_else(|| payload.pointer("/tool_call/args/path"))
        .or_else(|| payload.pointer("/toolArgs/Path"))
        .or_else(|| payload.pointer("/args/Path"))
        .or_else(|| payload.pointer("/args/path"))
        .and_then(|v| v.as_str());

    if let Some(p) = path {
        let p_obj = std::path::Path::new(p);
        let name = p_obj.file_name().and_then(|n| n.to_str()).unwrap_or(p);
        return Some(name.to_string());
    }

    // 2. CommandLine
    let cmd = payload
        .pointer("/toolCall/args/CommandLine")
        .or_else(|| payload.pointer("/tool_call/args/CommandLine"))
        .or_else(|| payload.pointer("/toolArgs/CommandLine"))
        .or_else(|| payload.pointer("/args/CommandLine"))
        .and_then(|v| v.as_str());

    if let Some(c) = cmd {
        let trimmed = c.trim();
        let first_line = trimmed.lines().next().unwrap_or(trimmed).trim();
        let short = if first_line.len() > 30 {
            format!("{}...", &first_line[..30])
        } else {
            first_line.to_string()
        };
        return Some(short);
    }

    // 3. Query
    let query = payload
        .pointer("/toolCall/args/query")
        .or_else(|| payload.pointer("/tool_call/args/query"))
        .or_else(|| payload.pointer("/args/query"))
        .and_then(|v| v.as_str());

    if let Some(q) = query {
        return Some(q.to_string());
    }

    None
}

// Helper to extract full raw command string
fn extract_raw_cmd(payload: &Value) -> Option<String> {
    payload
        .pointer("/toolCall/args/CommandLine")
        .or_else(|| payload.pointer("/tool_call/args/CommandLine"))
        .or_else(|| payload.pointer("/toolArgs/CommandLine"))
        .or_else(|| payload.pointer("/args/CommandLine"))
        .or_else(|| payload.pointer("/toolCall/args/command"))
        .or_else(|| payload.pointer("/args/command"))
        .or_else(|| payload.pointer("/toolCall/args/cmd"))
        .or_else(|| payload.pointer("/args/cmd"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

// Determines if a command is critical/destructive and MUST ask for approval
fn is_critical_command(cmd: &str) -> bool {
    let normalized = cmd.to_lowercase().split_whitespace().collect::<Vec<_>>().join(" ");
    let keywords = [
        "git push",
        "git reset --hard",
        "git clean",
        "rm -rf",
        "rm -r ",
        "remove-item",
        "del /f",
        "del /s",
        "rmdir /s",
        "rd /s",
        "npm publish",
        "cargo publish",
        "drop database",
        "drop table",
        "taskkill /f",
        "format ",
        "diskpart",
    ];
    keywords.iter().any(|&kw| normalized.contains(kw))
}

fn notify_state(app: &AppHandle, state: &AgentState) {
    let view = get_state_view(state);
    let _ = app.emit("agent://state_changed", &view);
    let val = serde_json::to_value(&view).unwrap_or_default();
    crate::companion::broadcast_event("agent://state_changed", &val);
}

fn notify_approval(app: &AppHandle, pending: &PendingApproval) {
    let _ = app.emit("agent://pending_approval", pending);
    let val = serde_json::to_value(pending).unwrap_or_default();
    crate::companion::broadcast_event("agent://pending_approval", &val);
}

/// Raise an approval card in the notch / PWA and wait for the user.
/// Resolves to "allow", "always", "deny", or "timeout".
async fn request_approval(
    state: &AgentState,
    app: &AppHandle,
    tool_name: String,
    details: String,
    conversation_id: Option<String>,
    request_key: Option<String>,
) -> String {
    // The OpenCode plugin is loaded twice per process, so the same approval can
    // arrive twice. Only the first call may open a prompt; duplicates wait for
    // that same decision instead of showing a second dialog.
    if let Some(key) = request_key.as_deref() {
        const RECENT: Duration = Duration::from_secs(3);
        {
            let mut recent = state.approval_recent.lock().unwrap();
            recent.retain(|_, (_, at)| at.elapsed() < RECENT);
            if let Some((decision, _)) = recent.get(key) {
                return decision.clone();
            }
        }

        let existing = state
            .approval_relays
            .lock()
            .unwrap()
            .get(key)
            .map(|tx| tx.subscribe());
        if let Some(mut rx) = existing {
            return match tokio::time::timeout(Duration::from_secs(55), rx.recv()).await {
                Ok(Ok(value)) => value,
                _ => "timeout".to_string(),
            };
        }

        let (tx, _) = tokio::sync::broadcast::channel::<String>(4);
        state
            .approval_relays
            .lock()
            .unwrap()
            .insert(key.to_string(), tx);
    }

    let approval_id = format!("appr_{}", now_ms());
    let (tx, rx) = tokio::sync::oneshot::channel::<String>();

    let pending_item = PendingApproval {
        id: approval_id.clone(),
        tool_name,
        command: Some(details.clone()),
        details,
        conversation_id,
        step_idx: None,
        created_at: now_ms(),
        source: state.source.lock().unwrap().clone(),
    };

    *state.status.lock().unwrap() = "waiting_approval".to_string();
    *state.pending.lock().unwrap() = Some(pending_item.clone());
    state.approval_tx.lock().unwrap().insert(approval_id.clone(), tx);

    notify_approval(app, &pending_item);
    notify_state(app, state);
    let _ = app.emit("notch://open", Some("agent"));
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_always_on_top(true);
        let _ = w.set_focus();
    }

    // Wait up to 55 seconds for user confirmation from notch / companion.
    let decision = match tokio::time::timeout(Duration::from_secs(55), rx).await {
        Ok(Ok(value)) => value,
        _ => "timeout".to_string(),
    };

    state.approval_tx.lock().unwrap().remove(&approval_id);
    *state.pending.lock().unwrap() = None;
    *state.status.lock().unwrap() = if decision == "deny" || decision == "timeout" {
        "idle".to_string()
    } else {
        "tool_running".to_string()
    };
    notify_state(app, state);

    if let Some(key) = request_key.as_deref() {
        if let Some(tx) = state.approval_relays.lock().unwrap().remove(key) {
            let _ = tx.send(decision.clone());
        }
        state.approval_recent.lock().unwrap().insert(
            key.to_string(),
            (decision.clone(), std::time::Instant::now()),
        );
    }

    decision
}

fn is_critical_payload(payload: &Value, raw_cmd: &str) -> bool {
    let tool_name = extract_tool_name(payload);
    let lower_tool = tool_name.to_lowercase();

    // 1. Interactive questions & review requests (ask_question tool from Antigravity)
    if lower_tool.contains("ask_question") || lower_tool.contains("question") || lower_tool.contains("review") {
        return true;
    }

    // 2. Artifact plan & review requests (e.g. RequestFeedback: true)
    let request_feedback = payload
        .pointer("/toolCall/args/ArtifactMetadata/RequestFeedback")
        .or_else(|| payload.pointer("/tool_call/args/ArtifactMetadata/RequestFeedback"))
        .or_else(|| payload.pointer("/toolArgs/ArtifactMetadata/RequestFeedback"))
        .or_else(|| payload.pointer("/args/ArtifactMetadata/RequestFeedback"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if request_feedback {
        return true;
    }

    // 3. Command execution requiring sandbox bypass (network or elevated host access)
    let is_bypass = payload
        .pointer("/toolCall/args/BypassSandbox")
        .or_else(|| payload.pointer("/tool_call/args/BypassSandbox"))
        .or_else(|| payload.pointer("/toolArgs/BypassSandbox"))
        .or_else(|| payload.pointer("/args/BypassSandbox"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if is_bypass {
        return true;
    }

    // 4. Critical command keywords (git push, rm, del, etc.)
    is_critical_command(raw_cmd)
}

// -----------------------------------------------------------------------------
// CLI Hook Runner: Called from main() when Antigravity executes narra-notch.exe
// -----------------------------------------------------------------------------

fn write_stdout_line(line: &str) {
    let mut out = std::io::stdout().lock();
    let _ = out.write_all(line.as_bytes());
    let _ = out.write_all(b"\n");
    let _ = out.flush();
}

pub fn run_hook_client(event_type: &str) -> i32 {
    // 1. Read input payload from stdin
    let mut stdin_buf = String::new();
    let _ = std::io::stdin().read_to_string(&mut stdin_buf);

    let parsed_payload: Value = serde_json::from_str(&stdin_buf)
        .unwrap_or_else(|_| json!({ "raw": stdin_buf }));

    let raw_cmd = extract_raw_cmd(&parsed_payload).unwrap_or_default();
    let is_critical = event_type == "PreToolUse" && is_critical_payload(&parsed_payload, &raw_cmd);

    // 2. Connect to the running narra-notch named pipe
    #[cfg(windows)]
    {
        use std::fs::OpenOptions;

        let cwd = std::env::current_dir().ok().map(|p| p.to_string_lossy().to_string());
        if let Ok(mut pipe) = OpenOptions::new().read(true).write(true).open(PIPE_NAME) {
            let message = json!({
                "event": event_type,
                "source": "antigravity",
                "payload": parsed_payload,
                "cwd": cwd
            });

            if let Ok(mut out_bytes) = serde_json::to_vec(&message) {
                out_bytes.push(b'\n');
                let _ = pipe.write_all(&out_bytes);
                let _ = pipe.flush();
            }

            if is_critical {
                use std::io::BufRead;
                let mut reader = std::io::BufReader::new(pipe);
                let mut resp_str = String::new();
                if reader.read_line(&mut resp_str).is_ok() && !resp_str.trim().is_empty() {
                    write_stdout_line(resp_str.trim());
                    return 0;
                }
            }
        }

        // Safe fallback: allow non-critical / default without ever panicking
        if event_type == "PreToolUse" {
            write_stdout_line(r#"{"decision":"allow"}"#);
        } else {
            write_stdout_line(r#"{"status":"ok"}"#);
        }
        0
    }

    #[cfg(not(windows))]
    {
        let _ = event_type;
        0
    }
}

// -----------------------------------------------------------------------------
// Named Pipe Server (runs inside narra-notch GUI background)
// -----------------------------------------------------------------------------

#[cfg(windows)]
pub fn start_pipe_server(app: AppHandle) {
    use tokio::net::windows::named_pipe::ServerOptions;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

    std::thread::spawn(move || {
        let rt = match tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
        {
            Ok(rt) => rt,
            Err(_) => return,
        };

        rt.block_on(async move {
            loop {
                let server = match ServerOptions::new()
                    .first_pipe_instance(false)
                    .create(PIPE_NAME)
                {
                    Ok(s) => s,
                    Err(_) => {
                        tokio::time::sleep(Duration::from_millis(1000)).await;
                        continue;
                    }
                };

                if server.connect().await.is_err() {
                    continue;
                }

                let app_clone = app.clone();
                tokio::spawn(async move {
                    let (reader, mut writer) = tokio::io::split(server);
                    let mut lines = BufReader::new(reader).lines();

                    if let Ok(Some(line)) = lines.next_line().await {
                        if let Ok(msg) = serde_json::from_str::<Value>(&line) {
                            let event = msg.get("event").and_then(|e| e.as_str()).unwrap_or("");
                            let payload = msg.get("payload").cloned().unwrap_or(Value::Null);
                            let cwd = msg.get("cwd").and_then(|c| c.as_str()).map(|s| s.to_string());
                            let source = msg
                                .get("source")
                                .and_then(|s| s.as_str())
                                .unwrap_or("antigravity")
                                .to_string();

                            let state = app_clone.state::<AgentState>();
                            *state.source.lock().unwrap() = source;
                            if let Some(c) = cwd {
                                *state.workspace_dir.lock().unwrap() = Some(c);
                            }
                            let response = handle_event(event, payload, &state, &app_clone).await;

                            if let Some(resp_val) = response {
                                let mut resp_str = serde_json::to_string(&resp_val).unwrap_or_default();
                                resp_str.push('\n');
                                let _ = writer.write_all(resp_str.as_bytes()).await;
                                let _ = writer.flush().await;
                            }
                        }
                    }
                });
            }
        });
    });
}

#[cfg(not(windows))]
pub fn start_pipe_server(_app: AppHandle) {}

async fn handle_event(
    event: &str,
    payload: Value,
    state: &AgentState,
    app: &AppHandle,
) -> Option<Value> {
    let conv_id = payload
        .get("conversationId")
        .or_else(|| payload.get("conversation_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let last_user_input = payload
        .get("lastUserInput")
        .or_else(|| payload.get("last_user_input"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let source = state.source.lock().unwrap().clone();

    match event {
        // Asked by the OpenCode plugin: may it turn the default allow-all policy
        // into an ask policy for this session?
        "GetRuntimeConfig" => Some(json!({
            "askPermissions": ask_permissions(),
            "pluginVersion": 2,
        })),
        "SessionStart" => {
            *state.active.lock().unwrap() = true;
            *state.status.lock().unwrap() = "idle".to_string();
            *state.conversation_id.lock().unwrap() = conv_id;
            *state.current_tool.lock().unwrap() = None;
            *state.current_tool_category.lock().unwrap() = None;
            *state.has_read.lock().unwrap() = false;
            *state.has_edit.lock().unwrap() = false;
            *state.has_bash.lock().unwrap() = false;
            *state.has_done.lock().unwrap() = false;
            *state.pending.lock().unwrap() = None;
            notify_state(app, state);
            Some(json!({ "status": "ok" }))
        }
        "PreInvocation" => {
            *state.active.lock().unwrap() = true;
            *state.status.lock().unwrap() = "thinking".to_string();
            if conv_id.is_some() {
                *state.conversation_id.lock().unwrap() = conv_id;
            }
            if last_user_input.is_some() {
                *state.last_input.lock().unwrap() = last_user_input;
            }
            *state.current_tool_category.lock().unwrap() = None;
            *state.has_done.lock().unwrap() = false;
            notify_state(app, state);
            Some(json!({ "status": "ok" }))
        }
        "PreToolUse" => {
            let tool_name = extract_tool_name(&payload);
            let target = extract_tool_target(&payload);
            let display_tool = if let Some(ref t) = target {
                format!("{} · {}", tool_name, t)
            } else {
                tool_name.clone()
            };

            let lower = tool_name.to_lowercase();
            let category = if lower.contains("read")
                || lower.contains("search")
                || lower.contains("list")
                || lower.contains("get")
                || lower.contains("prime")
                || lower.contains("query")
            {
                *state.has_read.lock().unwrap() = true;
                "read"
            } else if lower.contains("edit") || lower.contains("write") || lower.contains("patch") {
                *state.has_edit.lock().unwrap() = true;
                "edit"
            } else if lower.contains("command")
                || lower.contains("bash")
                || lower.contains("terminal")
                || lower.contains("exec")
                || lower.contains("run")
            {
                *state.has_bash.lock().unwrap() = true;
                "bash"
            } else {
                *state.has_read.lock().unwrap() = true;
                "read"
            };

            *state.active.lock().unwrap() = true;
            *state.current_tool.lock().unwrap() = Some(display_tool);
            *state.current_tool_category.lock().unwrap() = Some(category.to_string());
            let tool_event = json!({
                "tool": tool_name,
                "category": category,
                "payload": payload
            });
            let _ = app.emit("agent://tool_call", &tool_event);
            crate::companion::broadcast_event("agent://tool_call", &tool_event);

            // Smart Critical & Review Guard: questions, plan feedback, and dangerous ops ask for approval.
            // OpenCode already gates tools through its own permission system, so only relay there.
            let raw_cmd = extract_raw_cmd(&payload).unwrap_or_default();
            if source != "opencode" && is_critical_payload(&payload, &raw_cmd) {
                // Format friendly details for Notch UI
                let question_text = if lower.contains("ask_question") || lower.contains("question") {
                    payload
                        .pointer("/toolCall/args/questions/0/question")
                        .or_else(|| payload.pointer("/tool_call/args/questions/0/question"))
                        .or_else(|| payload.pointer("/args/questions/0/question"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                } else {
                    None
                };

                let request_feedback = payload
                    .pointer("/toolCall/args/ArtifactMetadata/RequestFeedback")
                    .or_else(|| payload.pointer("/tool_call/args/ArtifactMetadata/RequestFeedback"))
                    .or_else(|| payload.pointer("/args/ArtifactMetadata/RequestFeedback"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                let display_details = if let Some(ref q) = question_text {
                    format!("Pertanyaan: {}", q)
                } else if request_feedback {
                    format!("Review Rencana Kerja: {}", target.as_deref().unwrap_or("Artifact"))
                } else if !raw_cmd.is_empty() {
                    raw_cmd.clone()
                } else {
                    format!("Izin Eksekusi: {}", tool_name)
                };

                let decision = request_approval(state, app, tool_name.clone(), display_details, conv_id, None).await;

                return Some(match decision.as_str() {
                    "allow" | "always" => json!({ "decision": "allow" }),
                    "deny" => json!({
                        "decision": "deny",
                        "reason": "Ditolak pengguna melalui narra-notch"
                    }),
                    _ => json!({
                        "decision": "deny",
                        "reason": "Waktu konfirmasi di narra-notch habis"
                    }),
                });
            }

            *state.status.lock().unwrap() = "tool_running".to_string();
            notify_state(app, state);
            Some(json!({ "decision": "allow" }))
        }
        "ApprovalRequest" => {
            // OpenCode permission prompt relayed from the plugin. The plugin only
            // replies to OpenCode when the user picks allow / always / deny.
            let tool_name = payload
                .get("toolName")
                .and_then(|v| v.as_str())
                .unwrap_or("tool")
                .to_string();
            let details = payload
                .get("details")
                .and_then(|v| v.as_str())
                .unwrap_or("Izin eksekusi")
                .to_string();
            let request_key = payload
                .get("requestKey")
                .and_then(|v| v.as_str())
                .map(|v| v.to_string());

            let decision = request_approval(state, app, tool_name, details, conv_id, request_key).await;
            Some(json!({ "decision": decision }))
        }
        "PostToolUse" => {
            *state.active.lock().unwrap() = true;
            *state.status.lock().unwrap() = "thinking".to_string();
            *state.current_tool_category.lock().unwrap() = None;
            notify_state(app, state);
            Some(json!({ "status": "ok" }))
        }
        "PostInvocation" => {
            *state.active.lock().unwrap() = true;
            *state.status.lock().unwrap() = "finished".to_string();
            *state.has_done.lock().unwrap() = true;
            *state.current_tool_category.lock().unwrap() = None;
            *state.pending.lock().unwrap() = None;
            notify_state(app, state);
            Some(json!({ "status": "ok" }))
        }
        "Stop" => {
            *state.active.lock().unwrap() = true;
            *state.status.lock().unwrap() = "finished".to_string();
            *state.has_done.lock().unwrap() = true;
            *state.current_tool_category.lock().unwrap() = None;
            *state.pending.lock().unwrap() = None;
            notify_state(app, state);
            Some(json!({ "status": "ok" }))
        }
        _ => Some(json!({ "status": "ok" })),
    }
}

// -----------------------------------------------------------------------------
// Tauri Commands
// -----------------------------------------------------------------------------

#[tauri::command]
pub fn agent_get_status(state: State<'_, AgentState>) -> AgentStateView {
    get_state_view(&state)
}

#[tauri::command]
pub async fn agent_get_git_diff(state: State<'_, AgentState>) -> Result<String, String> {
    let ws = state.workspace_dir.lock().unwrap().clone();

    tokio::task::spawn_blocking(move || {
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
                let str_diff = String::from_utf8_lossy(&out.stdout).to_string();
                if !str_diff.trim().is_empty() {
                    return Ok(str_diff);
                }
            }
        }

        let mut cmd2 = std::process::Command::new("git");
        cmd2.arg("diff");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd2.creation_flags(0x0800_0000);
        }
        if let Some(ref dir) = ws {
            cmd2.current_dir(dir);
        }
        if let Ok(out) = cmd2.output() {
            if out.status.success() {
                let str_diff = String::from_utf8_lossy(&out.stdout).to_string();
                if !str_diff.trim().is_empty() {
                    return Ok(str_diff);
                }
            }
        }

        Ok(String::new())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn respond_approval_internal(
    id: &str,
    decision: &str,
    state: &AgentState,
    app: &AppHandle,
) -> bool {
    let mut txs = state.approval_tx.lock().unwrap();
    if let Some(tx) = txs.remove(id) {
        let _ = tx.send(decision.to_string());
        *state.pending.lock().unwrap() = None;
        if decision == "allow" || decision == "always" {
            *state.status.lock().unwrap() = "tool_running".to_string();
        } else {
            *state.status.lock().unwrap() = "idle".to_string();
        }
        notify_state(app, state);
        true
    } else {
        false
    }
}

#[tauri::command]
pub fn agent_respond_approval(
    id: String,
    allow: bool,
    always: Option<bool>,
    state: State<'_, AgentState>,
    app: AppHandle,
) -> Result<(), String> {
    let decision = if !allow {
        "deny"
    } else if always.unwrap_or(false) {
        "always"
    } else {
        "allow"
    };
    respond_approval_internal(&id, decision, &state, &app);
    Ok(())
}

#[tauri::command]
pub fn agent_is_hook_installed() -> bool {
    is_hook_installed_internal()
}

fn format_current_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let sec = now % 60;
    let min = (now / 60) % 60;
    let hour = (now / 3600) % 24;
    let mut days = (now / 86400) as i64;

    let mut year = 1970;
    loop {
        let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
        let days_in_year = if leap { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }
    let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    let month_days = [
        31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ];
    let mut month = 1;
    for &d in &month_days {
        if days < d {
            break;
        }
        days -= d;
        month += 1;
    }
    let day = days + 1;
    format!("{:04}{:02}{:02}-{:02}{:02}{:02}", year, month, day, hour, min, sec)
}

fn backup_hooks_file(path: &std::path::Path) {
    if !path.exists() {
        return;
    }
    // 1. Direct copy: hooks.json.bak
    let backup_path = path.with_extension("json.bak");
    let _ = fs::copy(path, backup_path);

    // 2. Timestamped copy: hooks.json.bak-YYYYMMDD-HHMMSS
    let ts = format_current_timestamp();
    if let Some(parent) = path.parent() {
        let timestamped = parent.join(format!("hooks.json.bak-{}", ts));
        let _ = fs::copy(path, timestamped);
    }
}

#[tauri::command]
pub fn agent_install_hooks() -> Result<(), String> {
    let path = hooks_config_path().ok_or("Cannot resolve %USERPROFILE% directory")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Automatically create a backup of existing hooks.json before modifying
    if path.exists() {
        backup_hooks_file(&path);
    }

    let mut config: Value = if path.exists() {
        let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&text).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };

    let exe_path = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('/', "\\");

    let command_for = |event: &str| -> String {
        if exe_path.contains(' ') {
            format!("\"{}\" --agent-hook {}", exe_path, event)
        } else {
            format!("{} --agent-hook {}", exe_path, event)
        }
    };

    let notch_hooks = json!({
        "enabled": true,
        "SessionStart": [
            {
                "type": "command",
                "command": command_for("SessionStart")
            }
        ],
        "PreInvocation": [
            {
                "type": "command",
                "command": command_for("PreInvocation")
            }
        ],
        "PreToolUse": [
            {
                "matcher": "*",
                "hooks": [
                    {
                        "type": "command",
                        "command": command_for("PreToolUse"),
                        "timeout": 60
                    }
                ]
            }
        ],
        "PostToolUse": [
            {
                "matcher": "*",
                "hooks": [
                    {
                        "type": "command",
                        "command": command_for("PostToolUse")
                    }
                ]
            }
        ],
        "PostInvocation": [
            {
                "type": "command",
                "command": command_for("PostInvocation")
            }
        ],
        "Stop": [
            {
                "type": "command",
                "command": command_for("Stop")
            }
        ]
    });

    if let Some(obj) = config.as_object_mut() {
        obj.insert("narra-notch".to_string(), notch_hooks);
    }

    let formatted = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, formatted).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn agent_uninstall_hooks() -> Result<(), String> {
    let path = hooks_config_path().ok_or("Cannot resolve %USERPROFILE% directory")?;
    if !path.exists() {
        return Ok(());
    }

    // Automatically create a backup before removing hooks
    backup_hooks_file(&path);

    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut config: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;

    if let Some(obj) = config.as_object_mut() {
        obj.remove("narra-notch");
    }

    let formatted = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, formatted).map_err(|e| e.to_string())?;
    Ok(())
}

// -----------------------------------------------------------------------------
// OpenCode V2 plugin install / uninstall
// -----------------------------------------------------------------------------

#[tauri::command]
pub fn agent_is_opencode_hook_installed() -> bool {
    is_opencode_hook_installed_internal()
}

/// Turn OpenCode shell/edit approvals on or off (the frontend owns the setting).
#[tauri::command]
pub fn agent_set_ask_permissions(enabled: bool) {
    set_ask_permissions(enabled);
}

/// Refresh an already installed generated plugin after an app update. Files that
/// are not ours are left untouched.
pub fn sync_opencode_plugin() {
    let Some(path) = opencode_plugin_path() else { return; };
    let Ok(existing) = fs::read_to_string(&path) else { return; };
    if !is_opencode_plugin_content(&existing) || existing == OPENCODE_PLUGIN_SOURCE {
        return;
    }
    let _ = fs::write(&path, OPENCODE_PLUGIN_SOURCE);
}

#[tauri::command]
pub fn agent_install_opencode_hooks() -> Result<(), String> {
    let path = opencode_plugin_path().ok_or("Cannot resolve OpenCode config directory")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Never silently overwrite a hand-written plugin at the same path.
    if path.exists() {
        let existing = fs::read_to_string(&path).unwrap_or_default();
        if !is_opencode_plugin_content(&existing) {
            let backup = path.with_extension("ts.bak");
            fs::copy(&path, backup).map_err(|e| e.to_string())?;
        }
    }

    fs::write(&path, OPENCODE_PLUGIN_SOURCE).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn agent_uninstall_opencode_hooks() -> Result<(), String> {
    let Some(path) = opencode_plugin_path() else { return Ok(()); };
    if !path.exists() {
        return Ok(());
    }

    let existing = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if !is_opencode_plugin_content(&existing) {
        return Err("narra-notch.ts exists but was not created by narra-notch".to_string());
    }

    fs::remove_file(&path).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opencode_plugin_install_roundtrip() {
        let dir = std::env::temp_dir().join(format!("narra-notch-opencode-{}", now_ms()));
        std::env::set_var("XDG_CONFIG_HOME", &dir);

        let path = opencode_plugin_path().expect("plugin path");
        assert!(!is_opencode_hook_installed_internal());

        agent_install_opencode_hooks().expect("install plugin");
        assert!(path.exists());
        assert!(is_opencode_hook_installed_internal());
        assert!(fs::read_to_string(&path)
            .unwrap_or_default()
            .contains(OPENCODE_PLUGIN_MARKER));

        agent_uninstall_opencode_hooks().expect("uninstall plugin");
        assert!(!path.exists());
        assert!(!is_opencode_hook_installed_internal());

        let _ = fs::remove_dir_all(&dir);
        std::env::remove_var("XDG_CONFIG_HOME");
    }
}
