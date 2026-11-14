//! Antigravity (`agy`) interactive chat runner, model switcher, and SQLite history parser.
//!
//! Provides:
//! 1. Headless process execution for `agy.exe` with real-time streaming output.
//! 2. SQLite parser for `~/.gemini/antigravity-cli/conversation_summaries.db` (and IDE db).
//! 3. Transcript parser for previous chat history (`transcript.jsonl`).
//! 4. Model discovery and attachment storage handling.

use std::fs;
use std::io::BufRead;
use std::path::PathBuf;
use std::process::Stdio;

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::agent::{self, AgentState};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub category: String, // "fast" | "reasoning" | "standard"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub preview: String,
    pub last_modified: String,
    pub workspace: Option<String>,
    pub step_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub role: String, // "user" | "assistant"
    pub content: String,
    pub timestamp: u64,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStreamChunk {
    pub conversation_id: Option<String>,
    pub delta: String,
    pub is_thinking: bool,
    pub done: bool,
    pub error: Option<String>,
}

fn get_gemini_db_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let base = PathBuf::from(profile).join(".gemini");
        let cli_db = base.join("antigravity-cli").join("conversation_summaries.db");
        if cli_db.exists() {
            paths.push(cli_db);
        }
        let ide_db = base.join("antigravity").join("conversation_summaries.db");
        if ide_db.exists() {
            paths.push(ide_db);
        }
    }
    paths
}

/// Strip prompt XML wrappers like `<USER_REQUEST> ... </USER_REQUEST>`
fn clean_user_prompt(raw: &str) -> String {
    let s = raw.to_string();
    if let Some(start) = s.find("<USER_REQUEST>") {
        if let Some(end) = s.find("</USER_REQUEST>") {
            return s[start + "<USER_REQUEST>".len()..end].trim().to_string();
        }
    }
    s.trim().to_string()
}

/// Retrieve supported models for Antigravity
pub fn get_available_models_internal() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "gemini-3.8-flash-high".to_string(),
            name: "Gemini 3.8 Flash (High)".to_string(),
            category: "fast".to_string(),
        },
        ModelInfo {
            id: "gemini-4-argon-medium".to_string(),
            name: "Gemini 4 Argon (Medium)".to_string(),
            category: "reasoning".to_string(),
        },
        ModelInfo {
            id: "gemini-4-argon-high".to_string(),
            name: "Gemini 4 Argon (High)".to_string(),
            category: "reasoning".to_string(),
        },
        ModelInfo {
            id: "claude-sonnet-5-5-high".to_string(),
            name: "Claude Sonnet 5.5 (High)".to_string(),
            category: "reasoning".to_string(),
        },
        ModelInfo {
            id: "claude-opus-5-5-high".to_string(),
            name: "Claude Opus 5.5 (High)".to_string(),
            category: "reasoning".to_string(),
        },
        ModelInfo {
            id: "gpt-oss-120b-medium".to_string(),
            name: "GPT-OSS 120B (Medium)".to_string(),
            category: "standard".to_string(),
        },
    ]
}

/// Query conversation history from local SQLite database
pub fn list_conversations_internal(query: Option<&str>) -> Vec<ConversationSummary> {
    let mut results: Vec<ConversationSummary> = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();
    let query_lower = query.map(|q| q.to_lowercase());

    for db_path in get_gemini_db_paths() {
        let conn = match Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let mut stmt = match conn.prepare(
            "SELECT conversation_id, title, preview, last_modified_time, workspace_uris, step_count 
             FROM conversation_summaries 
             ORDER BY last_modified_time DESC 
             LIMIT 100",
        ) {
            Ok(s) => s,
            Err(_) => continue,
        };

        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1).unwrap_or_default();
            let preview: String = row.get(2).unwrap_or_default();
            let last_mod: String = row.get(3).unwrap_or_default();
            let ws_raw: Option<String> = row.get(4).ok();
            let step_count: i64 = row.get(5).unwrap_or(0);
            Ok((id, title, preview, last_mod, ws_raw, step_count))
        });

        if let Ok(iter) = rows {
            for row in iter.flatten() {
                let (id, mut title, preview, last_mod, ws_raw, step_count) = row;
                if seen_ids.contains(&id) {
                    continue;
                }
                seen_ids.insert(id.clone());

                if title.trim().is_empty() {
                    if !preview.trim().is_empty() {
                        let first_line = preview.lines().next().unwrap_or(&preview).trim();
                        title = if first_line.len() > 50 {
                            format!("{}...", &first_line[..50])
                        } else {
                            first_line.to_string()
                        };
                    } else {
                        title = "Untitled Chat".to_string();
                    }
                }

                if let Some(ref q) = query_lower {
                    let matches_title = title.to_lowercase().contains(q);
                    let matches_preview = preview.to_lowercase().contains(q);
                    let matches_ws = ws_raw
                        .as_ref()
                        .map(|w| w.to_lowercase().contains(q))
                        .unwrap_or(false);
                    if !matches_title && !matches_preview && !matches_ws {
                        continue;
                    }
                }

                results.push(ConversationSummary {
                    id,
                    title,
                    preview,
                    last_modified: last_mod,
                    workspace: ws_raw,
                    step_count,
                });
            }
        }
    }

    results
}

/// Reject path segments that could escape `.gemini/.../brain/<id>` (`..`, slashes, drive colons).
fn is_safe_id(id: &str) -> bool {
    let s = id.trim();
    !s.is_empty()
        && s != "."
        && s != ".."
        && !s.contains("..")
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Strip directory components and unsafe characters from an uploaded filename.
fn sanitize_filename(raw: &str) -> Option<String> {
    let base = std::path::Path::new(raw)
        .file_name()
        .and_then(|n| n.to_str())?
        .trim();
    if base.is_empty() || base == "." || base == ".." {
        return None;
    }
    let clean: String = base
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0' => '_',
            other => other,
        })
        .collect();
    let clean = clean.trim_matches('.').trim().to_string();
    if clean.is_empty() {
        None
    } else {
        Some(clean)
    }
}

/// Delete a conversation from Antigravity history: the summary row, its FTS
/// entry, the transcript folder, and the per-conversation store. This is what
/// the trash button next to a history item removes.
pub fn delete_conversation_internal(conv_id: &str) -> Result<bool, String> {
    let id = conv_id.trim();
    if !is_safe_id(id) {
        return Err("Invalid conversation id".to_string());
    }

    let mut removed = false;

    for db_path in get_gemini_db_paths() {
        let conn = match Connection::open(&db_path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let _ = conn.busy_timeout(std::time::Duration::from_secs(2));
        // Search index first; it is optional and must not block the deletion.
        let _ = conn.execute(
            "DELETE FROM conversations_fts WHERE conversation_id = ?1",
            [id],
        );
        match conn.execute(
            "DELETE FROM conversation_summaries WHERE conversation_id = ?1",
            [id],
        ) {
            Ok(n) => removed |= n > 0,
            Err(e) => return Err(format!("Failed to delete conversation: {}", e)),
        }
    }

    // Remove the transcript and the conversation's own database, otherwise
    // Antigravity can re-index the same chat from these files.
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let base = PathBuf::from(profile).join(".gemini");
        for dir in ["antigravity-cli", "antigravity"] {
            let root = base.join(dir);
            let brain = root.join("brain").join(id);
            if brain.exists() {
                let _ = fs::remove_dir_all(&brain);
                removed = true;
            }
            let conversations = root.join("conversations");
            for suffix in ["", "-wal", "-shm"] {
                let path = conversations.join(format!("{}.db{}", id, suffix));
                if path.exists() {
                    let _ = fs::remove_file(&path);
                    removed = true;
                }
            }
        }
    }

    Ok(removed)
}

/// Read transcripts for a given conversation UUID
pub fn get_conversation_messages_internal(conv_id: &str) -> Vec<ChatMessage> {
    let conv_id = conv_id.trim();
    if !is_safe_id(conv_id) {
        return Vec::new();
    }
    let mut messages = Vec::new();
    let mut brain_paths = Vec::new();

    if let Ok(profile) = std::env::var("USERPROFILE") {
        let base = PathBuf::from(profile).join(".gemini");
        brain_paths.push(
            base.join("antigravity-cli")
                .join("brain")
                .join(conv_id)
                .join(".system_generated")
                .join("logs")
                .join("transcript.jsonl"),
        );
        brain_paths.push(
            base.join("antigravity")
                .join("brain")
                .join(conv_id)
                .join(".system_generated")
                .join("logs")
                .join("transcript.jsonl"),
        );
    }

    for path in brain_paths {
        if !path.exists() {
            continue;
        }
        let Ok(file) = fs::File::open(&path) else { continue };
        let reader = std::io::BufReader::new(file);

        for line_res in reader.lines() {
            let Ok(line) = line_res else { continue };
            if line.trim().is_empty() {
                continue;
            }
            let Ok(val) = serde_json::from_str::<Value>(&line) else { continue };

            let msg_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let content = val.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let step_idx = val.get("step_index").and_then(|v| v.as_i64()).unwrap_or(0);

            if msg_type == "USER_INPUT" {
                let clean_content = clean_user_prompt(content);
                if !clean_content.is_empty() {
                    messages.push(ChatMessage {
                        id: format!("{}-user-{}", conv_id, step_idx),
                        role: "user".to_string(),
                        content: clean_content,
                        timestamp: 0,
                        model: None,
                    });
                }
            } else if msg_type == "PLANNER_RESPONSE" {
                if !content.trim().is_empty() {
                    messages.push(ChatMessage {
                        id: format!("{}-assistant-{}", conv_id, step_idx),
                        role: "assistant".to_string(),
                        content: content.to_string(),
                        timestamp: 0,
                        model: None,
                    });
                }
            }
        }

        if !messages.is_empty() {
            break;
        }
    }

    messages
}

/// Execute `agy.exe` headless and stream its stdout/stderr
pub async fn send_chat_internal(
    app: &AppHandle,
    state: &AgentState,
    prompt: String,
    model: Option<String>,
    conversation_id: Option<String>,
    attachments: Option<Vec<String>>,
) -> Result<String, String> {
    let ws_dir = state
        .workspace_dir
        .lock()
        .unwrap()
        .clone()
        .or_else(|| std::env::current_dir().ok().map(|p| p.to_string_lossy().to_string()));

    // Compose final prompt including attachment mentions if present
    let mut final_prompt = prompt.clone();
    if let Some(ref atts) = attachments {
        if !atts.is_empty() {
            final_prompt.push_str("\n\n[Attached files/screenshots]:\n");
            for a in atts {
                final_prompt.push_str(&format!("- {}\n", a));
            }
        }
    }

    // Update agent state to thinking
    {
        *state.active.lock().unwrap() = true;
        *state.status.lock().unwrap() = "thinking".to_string();
        *state.last_input.lock().unwrap() = Some(prompt.clone());
        if let Some(ref cid) = conversation_id {
            *state.conversation_id.lock().unwrap() = Some(cid.clone());
        }
    }

    let view = agent::get_state_view(state);
    let _ = app.emit("agent://state_changed", &view);
    let val = serde_json::to_value(&view).unwrap_or_default();
    crate::companion::broadcast_event("agent://state_changed", &val);

    // Handle /remote-control command directly
    let trimmed = prompt.trim();
    if trimmed == "/remote-control" || trimmed.starts_with("/remote-control") {
        let sub = trimmed.strip_prefix("/remote-control").unwrap_or("").trim();
        let action = if sub.is_empty() { "status" } else { sub };
        let mut rc_cmd = Command::new("agy");
        rc_cmd.arg("remote-control").arg(action);
        #[cfg(windows)]
        {
            rc_cmd.creation_flags(0x0800_0000);
        }
        let output_res = rc_cmd.output().await;
        let response_text = match output_res {
            Ok(out) => {
                let stdout_text = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let stderr_text = String::from_utf8_lossy(&out.stderr).trim().to_string();
                let details = if !stdout_text.is_empty() {
                    stdout_text
                } else if !stderr_text.is_empty() {
                    stderr_text
                } else {
                    "Perintah berhasil dieksekusi.".to_string()
                };
                format!(
                    "📡 **Antigravity Remote Control ({})**:\n```\n{}\n```\n*Petunjuk:* Gunakan `agy remote-control start` di terminal untuk mengaktifkan daemon remote control, atau jalankan `agy --remote-control` saat membuka sesi.",
                    action, details
                )
            }
            Err(e) => format!("❌ Gagal menjalankan remote-control: {}", e),
        };

        let chunk = ChatStreamChunk {
            conversation_id: conversation_id.clone(),
            delta: response_text.clone(),
            is_thinking: false,
            done: true,
            error: None,
        };
        let _ = app.emit("agent://chat_stream", &chunk);
        let chunk_val = serde_json::to_value(&chunk).unwrap_or_default();
        crate::companion::broadcast_event("agent://chat_stream", &chunk_val);

        {
            *state.status.lock().unwrap() = "finished".to_string();
        }
        let view_finish = agent::get_state_view(state);
        let _ = app.emit("agent://state_changed", &view_finish);
        let val_finish = serde_json::to_value(&view_finish).unwrap_or_default();
        crate::companion::broadcast_event("agent://state_changed", &val_finish);

        return Ok(response_text);
    }

    // Build agy.exe command
    let mut cmd = Command::new("agy");
    cmd.arg("-p").arg(&final_prompt);

    if let Some(ref m) = model {
        if !m.trim().is_empty() {
            cmd.arg("--model").arg(m);
        }
    }

    if let Some(ref cid) = conversation_id {
        if !cid.trim().is_empty() {
            cmd.arg("--conversation").arg(cid);
        }
    }

    if let Some(ref dir) = ws_dir {
        cmd.current_dir(dir);
    }

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    #[cfg(windows)]
    {
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn agy: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    let app_clone = app.clone();
    let conv_id_clone = conversation_id.clone();
    let mut full_response = String::new();

    let mut stdout_done = false;
    let mut stderr_done = false;

    while !stdout_done || !stderr_done {
        tokio::select! {
            line = stdout_reader.next_line(), if !stdout_done => {
                match line {
                    Ok(Some(l)) => {
                        full_response.push_str(&l);
                        full_response.push('\n');
                        let chunk = ChatStreamChunk {
                            conversation_id: conv_id_clone.clone(),
                            delta: format!("{}\n", l),
                            is_thinking: false,
                            done: false,
                            error: None,
                        };
                        let _ = app_clone.emit("agent://chat_stream", &chunk);
                        let chunk_val = serde_json::to_value(&chunk).unwrap_or_default();
                        crate::companion::broadcast_event("agent://chat_stream", &chunk_val);
                    }
                    _ => {
                        stdout_done = true;
                    }
                }
            }
            err_line = stderr_reader.next_line(), if !stderr_done => {
                match err_line {
                    Ok(Some(el)) => {
                        full_response.push_str(&el);
                        full_response.push('\n');
                        let chunk = ChatStreamChunk {
                            conversation_id: conv_id_clone.clone(),
                            delta: format!("{}\n", el),
                            is_thinking: false,
                            done: false,
                            error: None,
                        };
                        let _ = app_clone.emit("agent://chat_stream", &chunk);
                        let chunk_val = serde_json::to_value(&chunk).unwrap_or_default();
                        crate::companion::broadcast_event("agent://chat_stream", &chunk_val);
                    }
                    _ => {
                        stderr_done = true;
                    }
                }
            }
        }
    }

    let status = child.wait().await.map_err(|e| format!("Process error: {}", e))?;

    // Mark completion
    let final_chunk = ChatStreamChunk {
        conversation_id: conv_id_clone,
        delta: String::new(),
        is_thinking: false,
        done: true,
        error: if status.success() {
            None
        } else {
            Some(format!("Exited with code: {:?}", status.code()))
        },
    };

    let _ = app.emit("agent://chat_stream", &final_chunk);
    let final_val = serde_json::to_value(&final_chunk).unwrap_or_default();
    crate::companion::broadcast_event("agent://chat_stream", &final_val);

    // Update agent state to finished
    {
        *state.status.lock().unwrap() = "finished".to_string();
    }
    let view_finish = agent::get_state_view(state);
    let _ = app.emit("agent://state_changed", &view_finish);
    let val_finish = serde_json::to_value(&view_finish).unwrap_or_default();
    crate::companion::broadcast_event("agent://state_changed", &val_finish);

    Ok(full_response)
}

// -----------------------------------------------------------------------------
// Tauri Commands
// -----------------------------------------------------------------------------

#[tauri::command]
pub fn agent_get_available_models() -> Vec<ModelInfo> {
    get_available_models_internal()
}

#[tauri::command]
pub fn agent_list_conversations(query: Option<String>) -> Vec<ConversationSummary> {
    list_conversations_internal(query.as_deref())
}

#[tauri::command]
pub fn agent_get_conversation_messages(conversation_id: String) -> Vec<ChatMessage> {
    get_conversation_messages_internal(&conversation_id)
}

#[tauri::command]
pub fn agent_delete_conversation(conversation_id: String) -> Result<bool, String> {
    delete_conversation_internal(&conversation_id)
}

#[tauri::command]
pub async fn agent_send_chat(
    app: AppHandle,
    state: State<'_, AgentState>,
    prompt: String,
    model: Option<String>,
    conversation_id: Option<String>,
    attachments: Option<Vec<String>>,
) -> Result<String, String> {
    send_chat_internal(&app, &state, prompt, model, conversation_id, attachments).await
}

#[tauri::command]
pub fn agent_save_temp_attachment(
    name: String,
    base64_data: String,
    conversation_id: Option<String>,
) -> Result<String, String> {
    let conv_id = conversation_id
        .as_deref()
        .map(str::trim)
        .filter(|id| is_safe_id(id))
        .unwrap_or("shared_uploads")
        .to_string();
    let safe_name = sanitize_filename(&name).ok_or_else(|| "Invalid attachment filename".to_string())?;
    let user_profile = std::env::var("USERPROFILE").map_err(|e| e.to_string())?;

    let upload_dir = PathBuf::from(user_profile)
        .join(".gemini")
        .join("antigravity-cli")
        .join("brain")
        .join(&conv_id)
        .join(".user_uploaded");

    fs::create_dir_all(&upload_dir).map_err(|e| e.to_string())?;

    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| e.to_string())?;

    let file_path = upload_dir.join(&safe_name);
    fs::write(&file_path, decoded).map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_id_blocks_path_traversal() {
        assert!(is_safe_id("6b7e79c9-44cb-4bb7-8bcb-a249a2b7f483"));
        assert!(is_safe_id("shared_uploads"));
        assert!(!is_safe_id(""));
        assert!(!is_safe_id(".."));
        assert!(!is_safe_id("../etc/passwd"));
        assert!(!is_safe_id("..\\windows\\system32"));
        assert!(!is_safe_id("a/b"));
    }

    #[test]
    fn sanitize_filename_strips_directories() {
        assert_eq!(
            sanitize_filename("../../Startup/evil.bat"),
            Some("evil.bat".to_string())
        );
        assert_eq!(
            sanitize_filename(r"C:\Users\book\Desktop\photo.png"),
            Some("photo.png".to_string())
        );
        assert_eq!(sanitize_filename(".."), None);
        assert_eq!(sanitize_filename(""), None);
    }
}
