import { listen } from "@tauri-apps/api/event";
import { createStore } from "../../lib/store";
import { isNative } from "../../platform/native";
import { showcase } from "../../dev/showcase-data";
import { agentService } from "../../platform/services";
import { companionEventUrl } from "../../platform/companionUrl";
import {
  playApprovalAlert,
  playSuccessSound,
  playDeniedSound,
  playFinishSound,
  playCoucouSound,
  playAgentSound,
} from "../../lib/agentSound";
import { settings } from "../../settings/store";
import { navigate } from "../../notch/nav";
import type {
  AgentStateView,
  PendingApproval,
  ModelInfo,
  ConversationSummary,
  ChatMessage,
  ChatStreamChunk,
} from "./types";
import { buildFileDiff, parseUnifiedDiff } from "./coucou/diff";

export function isAgentToolEnabled(): boolean {
  const tools = settings.get().tools;
  const tool = tools.find((t) => t.id === "agent");
  return tool ? tool.enabled : true;
}

const defaultState: AgentStateView = {
  active: false,
  status: "idle",
  isHookInstalled: false,
  pendingApproval: null,
  diffs: [],
};

export const agentStore = createStore<AgentStateView>(defaultState, {
  persist: "agent.v1",
});

export interface AttachmentItem {
  name: string;
  path: string;
  previewUrl?: string;
}

export interface AgentChatState {
  conversationId: string | null;
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  selectedModel: string;
  availableModels: ModelInfo[];
  attachments: AttachmentItem[];
  conversations: ConversationSummary[];
  isHistoryOpen: boolean;
  historyQuery: string;
  isLoadingHistory: boolean;
}

const defaultChatState: AgentChatState = {
  conversationId: null,
  messages: [],
  streamingText: "",
  isStreaming: false,
  selectedModel: "gemini-3.8-flash-high",
  availableModels: [],
  attachments: [],
  conversations: [],
  isHistoryOpen: false,
  historyQuery: "",
  isLoadingHistory: false,
};

export const agentChatStore = createStore<AgentChatState>(defaultChatState, {
  persist: "agent_chat.v1",
});

function handleChatStreamChunk(chunk: ChatStreamChunk) {
  if (!chunk) return;
  const cur = agentChatStore.get();

  if (chunk.delta) {
    agentChatStore.set((s) => ({
      ...s,
      streamingText: s.streamingText + chunk.delta,
      isStreaming: true,
    }));
  }

  if (chunk.done) {
    const finalContent = agentChatStore.get().streamingText.trim();
    if (finalContent) {
      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        role: "assistant",
        content: finalContent,
        timestamp: Date.now(),
        model: cur.selectedModel,
      };
      agentChatStore.set((s) => ({
        ...s,
        messages: [...s.messages, assistantMsg],
        streamingText: "",
        isStreaming: false,
      }));
    } else {
      agentChatStore.set((s) => ({
        ...s,
        isStreaming: false,
      }));
    }
    // Mobile companion owns its own alert sounds (and system banner handles the rest).
    if (isNative) playFinishSound();
    void refreshConversationHistory();
  }
}

let isInitialized = false;

export function initAgentStore() {
  if (isInitialized) return;
  isInitialized = true;

  // Showcase (README screenshots): keep the seeded demo state; the browser mock
  // backend would otherwise reset status to idle and clear the demo diffs.
  if (showcase) return;

  // Fetch initial status from Rust backend
  agentService.getStatus().then((status) => {
    agentStore.set((prev) => ({
      ...prev,
      ...status,
    }));
  });

  // Fetch initial git diff if any
  refreshGitDiff();

  // Load models and initial conversation history
  agentService.getAvailableModels().then((models) => {
    if (models.length > 0) {
      agentChatStore.set((cur) => ({ ...cur, availableModels: models }));
    }
  });
  void refreshConversationHistory();

  if (isNative) {
    // Listen for state changes from Rust background pipe server
    listen<AgentStateView>("agent://state_changed", (event) => {
      if (!isAgentToolEnabled()) return;
      const prev = agentStore.get();
      const next = event.payload;

      // Sound: start when agent begins working from idle
      if (prev.status === "idle" && (next.status === "working" || next.status === "thinking")) {
        playAgentSound("start");
      }

      // Sound & git diff sync when agent finishes (done)
      if (prev.status !== "finished" && next.status === "finished") {
        playAgentSound("done");
        refreshGitDiff();
      }

      agentStore.set((cur) => ({
        ...cur,
        ...next,
        diffs: cur.diffs, // preserve live diffs
      }));
    });

    // Listen for live tool calls to play category sounds (read, edit, bash) and capture diffs
    listen<{ tool: string; category?: string; payload: any }>("agent://tool_call", (event) => {
      if (!isAgentToolEnabled()) return;
      const { tool, category, payload } = event.payload;

      const cat = category || (
        /edit|write|patch/i.test(tool) ? "edit" :
        /command|bash|terminal|run|exec/i.test(tool) ? "bash" : "read"
      );

      // Filtered sound: edit & bash only (read is muted), gentle volume & debounced
      playAgentSound(cat as any);

      const args = payload?.toolCall?.args || payload?.tool_call?.args || payload?.args || {};
      const diff = buildFileDiff(tool, args);
      if (diff) {
        agentStore.set((cur) => {
          const prevDiffs = cur.diffs || [];
          const filtered = prevDiffs.filter((d) => d.path !== diff.path);
          return {
            ...cur,
            diffs: [diff, ...filtered],
          };
        });
      }
    });

    // Listen for incoming tool approval requests
    // Listen for streaming responses from agy
    listen<ChatStreamChunk>("agent://chat_stream", (event) => {
      handleChatStreamChunk(event.payload);
    });

    listen<PendingApproval>("agent://pending_approval", (event) => {
      if (!isAgentToolEnabled()) {
        // Antigravity keeps its silent allow (the notch is not gating it).
        // OpenCode owns its own permissions, so fail closed instead of allowing
        // a shell command nobody looked at.
        if (event.payload.source === "opencode") denyPendingTool(event.payload.id);
        else approvePendingTool(event.payload.id);
        return;
      }
      playApprovalAlert();
      agentStore.set((cur) => ({
        ...cur,
        status: "waiting_approval",
        pendingApproval: event.payload,
      }));
      // Navigate to agent tab and pop open the notch window immediately
      navigate("agent");
      window.dispatchEvent(new CustomEvent("notch:open", { detail: { tab: "agent" } }));
    });
  } else {
    // Browser / Mobile Companion mode: connect to Server-Sent Events (SSE)
    const connectSSE = () => {
      const es = new EventSource(companionEventUrl("/api/events"));
      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "init" || msg.type === "agent://state_changed") {
            const next = msg.state || msg.data;
            agentStore.set((cur) => ({ ...cur, ...next, diffs: cur.diffs }));
          } else if (msg.type === "agent://pending_approval") {
            agentStore.set((cur) => ({
              ...cur,
              status: "waiting_approval",
              pendingApproval: msg.data,
            }));
            // Alert sound is handled once by MobileAgentCompanion (native banner or chime).
            navigate("agent");
            window.dispatchEvent(new CustomEvent("notch:open", { detail: { tab: "agent" } }));
          } else if (msg.type === "agent://chat_stream") {
            handleChatStreamChunk(msg.data);
          }
        } catch {}
      };
      es.onerror = () => {
        es.close();
        setTimeout(connectSSE, 3000);
      };
    };
    connectSSE();
  }
}

let isFetchingDiff = false;

export async function refreshGitDiff() {
  if (isFetchingDiff) return;
  isFetchingDiff = true;
  try {
    const rawDiff = await agentService.getGitDiff();
    if (!rawDiff || !rawDiff.trim()) {
      // Git repo is clean (e.g. committed or pushed) → clear diffs
      agentStore.set((cur) => ({
        ...cur,
        diffs: [],
      }));
      return;
    }
    const parsed = parseUnifiedDiff(rawDiff);
    agentStore.set((cur) => ({
      ...cur,
      diffs: parsed,
    }));
  } catch {
    // git diff fallback
  } finally {
    isFetchingDiff = false;
  }
}

export function clearDiffs() {
  agentStore.set((cur) => ({
    ...cur,
    diffs: [],
  }));
}

export async function approvePendingTool(id: string, always = false) {
  playSuccessSound();
  await agentService.respondApproval(id, true, always);
  agentStore.set((prev) => ({
    ...prev,
    pendingApproval: null,
    status: "tool_running",
  }));
}

/** Allow this action and remember it for the rest of the OpenCode session. */
export async function alwaysPendingTool(id: string) {
  await approvePendingTool(id, true);
}

export async function denyPendingTool(id: string) {
  playDeniedSound();
  await agentService.respondApproval(id, false);
  agentStore.set((prev) => ({
    ...prev,
    pendingApproval: null,
    status: "idle",
  }));
}

export async function toggleHooks(enable: boolean) {
  if (enable) {
    await agentService.installHooks();
  } else {
    await agentService.uninstallHooks();
  }
  const installed = await agentService.isHookInstalled();
  agentStore.set((prev) => ({
    ...prev,
    isHookInstalled: installed,
  }));
}

export async function toggleOpencodeHooks(enable: boolean) {
  if (enable) {
    await agentService.installOpencodeHooks();
  } else {
    await agentService.uninstallOpencodeHooks();
  }
  const installed = await agentService.isOpencodeHookInstalled();
  agentStore.set((prev) => ({
    ...prev,
    isOpencodeHookInstalled: installed,
  }));
}

export async function sendAgentChat(prompt: string) {
  const text = prompt.trim();
  const cur = agentChatStore.get();
  if (!text || cur.isStreaming) return;

  playCoucouSound("send");

  const userMsg: ChatMessage = {
    id: `user-${Date.now()}`,
    role: "user",
    content: text,
    timestamp: Date.now(),
    model: cur.selectedModel,
  };

  const attPaths = cur.attachments.map((a) => a.path);

  agentChatStore.set((s) => ({
    ...s,
    messages: [...s.messages, userMsg],
    isStreaming: true,
    streamingText: "",
    attachments: [],
  }));

  try {
    await agentService.sendChat(
      text,
      cur.selectedModel,
      cur.conversationId || undefined,
      attPaths.length > 0 ? attPaths : undefined
    );
  } catch (e) {
    agentChatStore.set((s) => ({
      ...s,
      isStreaming: false,
      streamingText: "",
      messages: [
        ...s.messages,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `Error: ${String(e)}`,
          timestamp: Date.now(),
        },
      ],
    }));
  }
}

export async function loadConversation(id: string) {
  try {
    const msgs = await agentService.getConversationMessages(id);
    agentChatStore.set((cur) => ({
      ...cur,
      conversationId: id,
      messages: msgs,
      streamingText: "",
      isStreaming: false,
      isHistoryOpen: false,
    }));
    agentStore.set((cur) => ({ ...cur, conversationId: id }));
  } catch {}
}

/** Remove a conversation from Antigravity history and from the local list. */
export async function deleteConversation(id: string) {
  const removed = await agentService.deleteConversation(id);
  if (!removed) return false;

  const wasActive = agentChatStore.get().conversationId === id;
  agentChatStore.set((cur) => ({
    ...cur,
    conversations: cur.conversations.filter((c) => c.id !== id),
    ...(wasActive
      ? {
          conversationId: null,
          messages: [],
          streamingText: "",
          isStreaming: false,
          attachments: [],
        }
      : {}),
  }));
  if (wasActive) agentStore.set((cur) => ({ ...cur, conversationId: undefined }));
  return true;
}

export function startNewConversation() {
  agentChatStore.set((cur) => ({
    ...cur,
    conversationId: null,
    messages: [],
    streamingText: "",
    isStreaming: false,
    isHistoryOpen: false,
    attachments: [],
  }));
  agentStore.set((cur) => ({ ...cur, conversationId: undefined }));
}

export function clearChat() {
  agentChatStore.set((cur) => ({
    ...cur,
    messages: [],
    streamingText: "",
    isStreaming: false,
    attachments: [],
  }));
}

export async function refreshConversationHistory(query?: string) {
  agentChatStore.set((cur) => ({
    ...cur,
    isLoadingHistory: true,
    historyQuery: query ?? cur.historyQuery,
  }));
  try {
    const list = await agentService.listConversations(query);
    agentChatStore.set((cur) => ({ ...cur, conversations: list, isLoadingHistory: false }));
  } catch {
    agentChatStore.set((cur) => ({ ...cur, isLoadingHistory: false }));
  }
}

export function setSelectedModel(modelId: string) {
  agentChatStore.set((cur) => ({ ...cur, selectedModel: modelId }));
}

export function addAttachment(name: string, path: string, previewUrl?: string) {
  agentChatStore.set((cur) => ({
    ...cur,
    attachments: [...cur.attachments, { name, path, previewUrl }],
  }));
}

export function removeAttachment(index: number) {
  agentChatStore.set((cur) => ({
    ...cur,
    attachments: cur.attachments.filter((_, i) => i !== index),
  }));
}

export function toggleHistoryDrawer(open?: boolean) {
  agentChatStore.set((cur) => ({
    ...cur,
    isHistoryOpen: open !== undefined ? open : !cur.isHistoryOpen,
  }));
  if (open !== false) {
    void refreshConversationHistory();
  }
}
