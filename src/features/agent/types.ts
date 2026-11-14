import type { FileDiff } from "./coucou/diff";

export interface PendingApproval {
  id: string;
  toolName: string;
  tool?: string;
  command?: string;
  details: string;
  conversationId?: string;
  stepIdx?: number;
  createdAt: number;
  /** "antigravity" | "opencode": who asked. OpenCode never auto-approves. */
  source?: string;
}

export type AgentStatus = "idle" | "thinking" | "working" | "tool_running" | "waiting_approval" | "finished";

export interface AgentStateView {
  active: boolean;
  status: AgentStatus;
  conversationId?: string;
  lastInput?: string;
  currentTool?: string;
  currentToolCategory?: "read" | "edit" | "bash" | null;
  hasRead?: boolean;
  hasEdit?: boolean;
  hasBash?: boolean;
  hasDone?: boolean;
  diffs?: FileDiff[];
  pendingApproval?: PendingApproval | null;
  isHookInstalled: boolean;
  /** OpenCode V2 plugin installed at ~/.config/opencode/plugins/narra-notch.ts */
  isOpencodeHookInstalled?: boolean;
  /** Which agent emitted the latest event. */
  source?: "antigravity" | "opencode";
}

export interface ModelInfo {
  id: string;
  name: string;
  category: "fast" | "reasoning" | "standard";
}

export interface ConversationSummary {
  id: string;
  title: string;
  preview: string;
  lastModified: string;
  workspace?: string;
  stepCount: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  model?: string;
}

export interface ChatStreamChunk {
  conversationId?: string;
  delta: string;
  isThinking: boolean;
  done: boolean;
  error?: string;
}
