import { invoke } from "@tauri-apps/api/core";
import { isNative } from "./native";
import { companionFetch } from "./companionUrl";

/**
 * Read/control the local OpenCode server from the notch.
 *
 * Desktop: Tauri commands in `src-tauri/src/opencode_api.rs` (Basic auth with
 * the password from `~/.config/opencode/service.json`).
 * Phone: `/api/opencode/*` on the PC companion server, behind the pairing gate.
 */

export interface OpenCodeSession {
  id: string;
  title?: string;
  parentID?: string;
  agent?: string;
  model?: { id: string; providerID: string; variant?: string };
  cost?: number;
  tokens?: { input: number; output: number; reasoning?: number };
  outcome?: "succeeded" | "failed" | "interrupted";
  time: { created: number; updated: number; busy?: number; idle?: number };
  /** Project the session runs in; new sessions reuse it. */
  location?: { directory: string };
}

export interface OpenCodeAgent {
  id: string;
  name?: string;
  description?: string;
}

export interface OpenCodeModel {
  id: string;
  providerID: string;
  name?: string;
}

export interface OpenCodeModelRef {
  id: string;
  providerID: string;
  variant?: string;
}

export type OpenCodeToolState =
  | { status: "streaming"; input?: unknown }
  | { status: "running"; input?: unknown }
  | { status: "completed"; input?: unknown; content?: unknown }
  | { status: "error"; input?: unknown; error?: unknown };

export type OpenCodePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool"; id: string; name: string; state: OpenCodeToolState };

export type OpenCodeMessageType =
  | "user"
  | "assistant"
  | "system"
  | "synthetic"
  | "shell"
  | "compaction"
  | "idle"
  | "skill"
  | "agent-switched"
  | "model-switched"
  | "location-switched";

export interface OpenCodeMessage {
  id: string;
  type: OpenCodeMessageType;
  time?: { created: number; completed?: number };
  /** User / system / synthetic messages carry plain text. */
  text?: string;
  /** Assistant messages carry ordered text, reasoning and tool parts. */
  content?: OpenCodePart[];
  agent?: string;
  model?: { id: string; providerID: string; variant?: string };
  error?: unknown;
}

export interface OpenCodeStatus {
  connected: boolean;
  version?: string | null;
  url?: string;
  error?: string;
}

const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};

/** JSON with a readable error, so the view can show OpenCode's own message. */
async function readJson(res: Response): Promise<unknown> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body;
}

export const opencodeService = {
  status: (): Promise<OpenCodeStatus> =>
    isNative
      ? invoke<OpenCodeStatus>("opencode_status")
      : companionFetch("/api/opencode/status")
          .then(readJson)
          .then((body) => body as OpenCodeStatus),

  sessions: (search?: string, limit?: number): Promise<OpenCodeSession[]> =>
    isNative
      ? invoke<OpenCodeSession[]>("opencode_sessions", { search, limit })
      : companionFetch(`/api/opencode/sessions${query({ q: search, limit })}`)
          .then(readJson)
          .then((body) => (Array.isArray(body) ? (body as OpenCodeSession[]) : [])),

  messages: (sessionId: string, limit?: number): Promise<OpenCodeMessage[]> =>
    isNative
      ? invoke<OpenCodeMessage[]>("opencode_session_messages", { sessionId, limit })
      : companionFetch(`/api/opencode/sessions/${encodeURIComponent(sessionId)}/messages${query({ limit })}`)
          .then(readJson)
          .then((body) => (Array.isArray(body) ? (body as OpenCodeMessage[]) : [])),

  agents: (): Promise<OpenCodeAgent[]> =>
    isNative
      ? invoke<OpenCodeAgent[]>("opencode_agents")
      : companionFetch("/api/opencode/agents")
          .then(readJson)
          .then((body) => (Array.isArray(body) ? (body as OpenCodeAgent[]) : [])),

  models: (): Promise<OpenCodeModel[]> =>
    isNative
      ? invoke<OpenCodeModel[]>("opencode_models")
      : companionFetch("/api/opencode/models")
          .then(readJson)
          .then((body) => (Array.isArray(body) ? (body as OpenCodeModel[]) : [])),

  createSession: (options: {
    title?: string;
    agent?: string;
    model?: OpenCodeModelRef;
    directory?: string;
  }): Promise<OpenCodeSession> => {
    const payload = {
      title: options.title,
      agent: options.agent,
      model: options.model,
      directory: options.directory,
    };
    return isNative
      ? invoke<OpenCodeSession>("opencode_new_session", {
          title: options.title,
          agent: options.agent,
          model: options.model,
          directory: options.directory,
        })
      : companionFetch("/api/opencode/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then(readJson)
          .then((body) => body as OpenCodeSession);
  },

  switchAgent: (sessionId: string, agent: string): Promise<void> =>
    isNative
      ? invoke("opencode_switch_agent", { sessionId, agent }).then(() => undefined)
      : companionFetch(`/api/opencode/sessions/${encodeURIComponent(sessionId)}/agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent }),
        })
          .then(readJson)
          .then(() => undefined),

  switchModel: (sessionId: string, model: OpenCodeModelRef): Promise<void> =>
    isNative
      ? invoke("opencode_switch_model", { sessionId, model }).then(() => undefined)
      : companionFetch(`/api/opencode/sessions/${encodeURIComponent(sessionId)}/model`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model }),
        })
          .then(readJson)
          .then(() => undefined),

  prompt: (sessionId: string, text: string): Promise<void> =>
    isNative
      ? invoke("opencode_prompt", { sessionId, text }).then(() => undefined)
      : companionFetch(`/api/opencode/sessions/${encodeURIComponent(sessionId)}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        })
          .then(readJson)
          .then(() => undefined),

  interrupt: (sessionId: string): Promise<void> =>
    isNative
      ? invoke("opencode_interrupt", { sessionId }).then(() => undefined)
      : companionFetch(`/api/opencode/sessions/${encodeURIComponent(sessionId)}/interrupt`, {
          method: "POST",
        })
          .then(readJson)
          .then(() => undefined),
};
