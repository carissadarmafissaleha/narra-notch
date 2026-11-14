import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsClockwise,
  ArrowUp,
  Brain,
  CaretDown,
  ChatCircleDots,
  Check,
  Cpu,
  FileText,
  Key,
  MagnifyingGlass,
  Paperclip,
  PaperPlaneRight,
  Plus,
  Stop,
  Wrench,
  X,
} from "@phosphor-icons/react";
import { agentService } from "../../platform/services";
import { agentStore } from "./store";
import {
  opencodeService,
  type OpenCodeAgent,
  type OpenCodeMessage,
  type OpenCodeModel,
  type OpenCodeSession,
  type OpenCodeStatus,
} from "../../platform/opencode";
import {
  CompanionAuthError,
  getCompanionToken,
  setCompanionToken,
} from "../../platform/companionUrl";
import { t } from "../../i18n";

/**
 * Live OpenCode transcript inside the notch.
 *
 * OpenCode keeps running in its own window; this view mirrors the active session
 * so a follower can read what the agent said and answer it without switching
 * apps. The plugin pipe already tells us which session is active and whether it
 * is busy, so the transcript only needs polling while something is happening.
 */

const POLL_BUSY_MS = 1_800;
const POLL_IDLE_MS = 8_000;

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return t("baru saja");
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function sessionLabel(session: OpenCodeSession): string {
  return session.title?.trim() || session.id;
}

function toolLine(message: OpenCodeMessage, index: number) {
  const part = message.content?.[index];
  if (!part || part.type !== "tool") return null;
  const state = part.state;
  const command =
    state.input && typeof state.input === "object" && "command" in state.input
      ? String((state.input as { command: unknown }).command)
      : state.input && typeof state.input === "object" && "path" in state.input
        ? String((state.input as { path: unknown }).path)
        : "";
  const done = state.status === "completed";
  const failed = state.status === "error";
  return (
    <div
      key={`${message.id}-${index}`}
      className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] leading-relaxed ${
        failed
          ? "border-red-500/30 bg-red-500/[0.06] text-red-300"
          : done
            ? "border-white/[0.06] bg-white/[0.03] text-zinc-400"
            : "border-sky-500/25 bg-sky-500/[0.06] text-sky-300"
      }`}
    >
      <Wrench size={12} className="mt-0.5 shrink-0" />
      <span className="shrink-0 font-medium">{part.name}</span>
      {command && <span className="min-w-0 truncate font-mono text-zinc-500">{command}</span>}
      <span className="ml-auto shrink-0">
        {failed ? t("Gagal") : done ? <Check size={11} weight="bold" /> : t("Menunggu…")}
      </span>
    </div>
  );
}

function AssistantParts({ message }: { message: OpenCodeMessage }) {
  return (
    <div className="flex flex-col gap-1.5">
      {(message.content ?? []).map((part, index) => {
        if (part.type === "text") {
          return (
            <div
              key={`${message.id}-text-${index}`}
              className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-zinc-200 select-text"
            >
              {part.text}
            </div>
          );
        }
        if (part.type === "reasoning") {
          return (
            <details
              key={`${message.id}-reasoning-${index}`}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5"
            >
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-zinc-500 select-none">
                <Brain size={12} />
                {t("Berpikir…")}
              </summary>
              <div className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-zinc-500">
                {part.text}
              </div>
            </details>
          );
        }
        return toolLine(message, index);
      })}
    </div>
  );
}

export function OpenCodeSessionView({ mobile = false }: { mobile?: boolean }) {
  const agent = agentStore.use();
  const pluginSession = agent.source === "opencode" ? agent.conversationId : undefined;

  const [selectedId, setSelectedId] = useState<string | undefined>(pluginSession);
  const [sessions, setSessions] = useState<OpenCodeSession[]>([]);
  const [messages, setMessages] = useState<OpenCodeMessage[]>([]);
  const [status, setStatus] = useState<OpenCodeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<"session" | "agent" | "model" | null>(null);
  const [agents, setAgents] = useState<OpenCodeAgent[]>([]);
  const [models, setModels] = useState<OpenCodeModel[]>([]);
  const [modelQuery, setModelQuery] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<
    { name: string; path: string; previewUrl?: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [needsPairing, setNeedsPairing] = useState(false);
  const [pairCodeDraft, setPairCodeDraft] = useState(() => getCompanionToken());
  const [pairingSubmitting, setPairingSubmitting] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  // Polling returns the same page most of the time; skip the re-render then.
  const lastMessages = useRef("");
  const lastSessions = useRef("");

  const selected = useMemo(
    () => sessions.find((session) => session.id === selectedId),
    [sessions, selectedId],
  );

  const filteredSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => {
      const label = sessionLabel(s).toLowerCase();
      const id = s.id.toLowerCase();
      return label.includes(q) || id.includes(q);
    });
  }, [sessions, sessionSearch]);
  // New sessions inherit the project and the picks of the one on screen.
  const context = selected ?? sessions[0];
  const busy = Boolean(selected?.time.busy && (!selected.time.idle || selected.time.busy > selected.time.idle));

  const modelLabel = useMemo(() => {
    if (!selected?.model) return undefined;
    const known = models.find(
      (model) => model.id === selected.model?.id && model.providerID === selected.model?.providerID,
    );
    return known?.name ?? selected.model.id;
  }, [models, selected]);

  const filteredModels = useMemo(() => {
    const search = modelQuery.trim().toLowerCase();
    const list = search
      ? models.filter((model) =>
          `${model.name ?? ""} ${model.id} ${model.providerID}`.toLowerCase().includes(search),
        )
      : models;
    // The picker stays snappy with 380 models; the search narrows it down.
    return list.slice(0, 60);
  }, [models, modelQuery]);

  const describeError = useCallback((e: unknown) => {
    if (e instanceof CompanionAuthError) {
      setNeedsPairing(true);
      return t("HP ini belum dipasangkan dengan Notch Windows.");
    }
    const message = e instanceof Error ? e.message : String(e);
    return message.includes("not running")
      ? t("OpenCode tidak berjalan. Buka OpenCode di PC lalu coba lagi.")
      : message;
  }, []);

  // Follow the session the plugin reports, unless the user picked another one.
  useEffect(() => {
    if (pluginSession && pluginSession !== selectedId) setSelectedId(pluginSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginSession]);

  // Nothing active yet: show the newest session instead of an empty tab.
  useEffect(() => {
    if (!selectedId && sessions.length > 0) setSelectedId(sessions[0].id);
  }, [selectedId, sessions]);

  const loadSessions = useCallback(async () => {
    try {
      const list = await opencodeService.sessions(undefined, 30);
      const serialized = JSON.stringify(list);
      if (serialized !== lastSessions.current) {
        lastSessions.current = serialized;
        setSessions(list);
      }
      setError(null);
      return list;
    } catch (e) {
      setError(describeError(e));
      return [];
    }
  }, [describeError]);

  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const list = await opencodeService.messages(sessionId, 80);
      const serialized = JSON.stringify(list);
      if (serialized !== lastMessages.current) {
        lastMessages.current = serialized;
        setMessages(list);
      }
      setError(null);
    } catch (e) {
      setError(describeError(e));
    }
  }, [describeError]);

  // Initial load: server status + recent sessions.
  useEffect(() => {
    let alive = true;
    void opencodeService
      .status()
      .then((next) => {
        if (!alive) return;
        setStatus(next);
        if (!next.connected) setError(next.error ?? t("OpenCode tidak berjalan."));
      })
      .catch((e) => alive && setError(describeError(e)));
    void loadSessions();
    return () => {
      alive = false;
    };
  }, [describeError, loadSessions]);

  // Transcript + session list refresh. Faster while the session is busy.
  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    const tick = () => {
      if (document.hidden) return;
      if (alive) void loadMessages(selectedId);
    };
    tick();
    const timer = setInterval(tick, busy ? POLL_BUSY_MS : POLL_IDLE_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selectedId, busy, loadMessages]);

  // Session list only changes on activity; refresh it with the busy session.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void loadSessions();
    }, POLL_IDLE_MS);
    return () => clearInterval(timer);
  }, [loadSessions]);

  // Agents and models are only needed once a picker opens.
  useEffect(() => {
    if (menu === "agent" && agents.length === 0) {
      void opencodeService
        .agents()
        .then(setAgents)
        .catch((e) => setError(describeError(e)));
    }
    if (menu === "model" && models.length === 0) {
      void opencodeService
        .models()
        .then(setModels)
        .catch((e) => setError(describeError(e)));
    }
  }, [menu, agents.length, models.length, describeError]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const createSession = async (title?: string) => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const session = await opencodeService.createSession({
        title,
        agent: context?.agent,
        model: context?.model,
        directory: context?.location?.directory,
      });
      lastSessions.current = "";
      setSessions((prev) => [session, ...prev.filter((item) => item.id !== session.id)]);
      lastMessages.current = "";
      setMessages([]);
      setSelectedId(session.id);
      setMenu(null);
      setSessionSearch("");
      composerRef.current?.focus();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setCreating(false);
    }
  };

  const switchAgent = async (agentId: string) => {
    if (!selectedId) return;
    setMenu(null);
    setSessions((prev) =>
      prev.map((session) => (session.id === selectedId ? { ...session, agent: agentId } : session)),
    );
    try {
      await opencodeService.switchAgent(selectedId, agentId);
    } catch (e) {
      setError(describeError(e));
    } finally {
      // The session list is the source of truth; re-read it either way.
      lastSessions.current = "";
      void loadSessions();
    }
  };

  const switchModel = async (model: OpenCodeModel) => {
    if (!selectedId) return;
    setMenu(null);
    setModelQuery("");
    setSessions((prev) =>
      prev.map((session) =>
        session.id === selectedId
          ? { ...session, model: { id: model.id, providerID: model.providerID } }
          : session,
      ),
    );
    try {
      await opencodeService.switchModel(selectedId, { id: model.id, providerID: model.providerID });
    } catch (e) {
      setError(describeError(e));
    } finally {
      lastSessions.current = "";
      void loadSessions();
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        setUploading(true);
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const dataUrl = reader.result as string;
            const base64Data = dataUrl.split(",")[1];
            const name = `screenshot_${Date.now()}.png`;
            const savedPath = await agentService.saveTempAttachment(
              name,
              base64Data,
              selectedId || undefined,
            );
            setAttachments((prev) => [
              ...prev,
              { name, path: savedPath, previewUrl: dataUrl },
            ]);
          } catch {
            setError(t("Gagal mengunggah gambar screenshot."));
          } finally {
            setUploading(false);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      await new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const dataUrl = reader.result as string;
            const base64Data = dataUrl.split(",")[1];
            const isImg = file.type.startsWith("image/");
            const savedPath = await agentService.saveTempAttachment(
              file.name,
              base64Data,
              selectedId || undefined,
            );
            setAttachments((prev) => [
              ...prev,
              { name: file.name, path: savedPath, previewUrl: isImg ? dataUrl : undefined },
            ]);
          } catch {
            setError(t("Gagal mengunggah file."));
          } finally {
            resolve();
          }
        };
        reader.readAsDataURL(file);
      });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const send = async () => {
    let text = draft.trim();
    if ((!text && attachments.length === 0) || !selectedId || sending) return;
    if (attachments.length > 0) {
      const mentions = attachments.map((a) => `- ${a.path}`).join("\n");
      text = text
        ? `${text}\n\n[Attached files/screenshots]:\n${mentions}`
        : `[Attached files/screenshots]:\n${mentions}`;
    }
    setSending(true);
    setError(null);
    try {
      await opencodeService.prompt(selectedId, text);
      setDraft("");
      setAttachments([]);
      void loadMessages(selectedId);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSending(false);
    }
  };

  const interrupt = async () => {
    if (!selectedId) return;
    try {
      await opencodeService.interrupt(selectedId);
      void loadMessages(selectedId);
    } catch (e) {
      setError(describeError(e));
    }
  };

  const submitPairing = async () => {
    const code = pairCodeDraft.trim().toUpperCase();
    if (!code) return;
    setPairingSubmitting(true);
    setPairingError(null);
    const prev = getCompanionToken();
    setCompanionToken(code);
    try {
      const next = await opencodeService.status();
      setStatus(next);
      setNeedsPairing(false);
      void loadSessions();
    } catch (e) {
      setCompanionToken(prev);
      if (e instanceof CompanionAuthError) {
        setPairingError(t("Kode pairing salah. Buat kode baru di Notch Windows, Einstellungen, Coding Agent."));
      } else {
        setPairingError(t("Tidak dapat menghubungi server PC."));
      }
    } finally {
      setPairingSubmitting(false);
    }
  };

  const visible = messages.filter(
    (message) =>
      message.type === "user" ||
      message.type === "assistant" ||
      message.type === "shell" ||
      message.type === "compaction",
  );

  if (needsPairing) {
    if (mobile) {
      const chars = Array.from({ length: 8 }, (_, idx) => pairCodeDraft[idx] || "");
      return (
        <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
          <b className="ca-et" style={{ fontSize: 20, marginTop: 4 }}>
            {t("Pairing OpenCode Chat")}
          </b>
          <p className="ca-ep" style={{ margin: "10px 8px 0" }}>
            {t("Buka Notch Windows → Settings → Coding Agent → salin Kode pairing HP untuk membuka chat OpenCode di HP ini.")}
          </p>
          <div className="relative my-5">
            <div className="ca-rw ca-ce" style={{ gap: 5 }}>
              {chars.map((ch, idx) => (
                <i
                  key={idx}
                  className={`ca-cell ${idx === pairCodeDraft.length ? "active" : ""}`}
                >
                  {ch}
                </i>
              ))}
            </div>
            <input
              type="text"
              value={pairCodeDraft}
              onChange={(e) => setPairCodeDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitPairing();
              }}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={8}
              aria-label={t("Pairing OpenCode Chat")}
              className="absolute inset-0 w-full h-full opacity-0 cursor-text"
              autoFocus
            />
          </div>
          {pairingError && (
            <p className="mb-3 text-[12px] leading-relaxed" style={{ color: "var(--er)" }}>
              {pairingError}
            </p>
          )}
          <button
            type="button"
            disabled={pairingSubmitting || !pairCodeDraft.trim()}
            onClick={() => void submitPairing()}
            className="ca-bt max-w-[340px]"
          >
            {pairingSubmitting ? t("Menghubungkan…") : t("Hubungkan Chat")}
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-lg">
          <ChatCircleDots size={28} weight="duotone" />
        </div>
        <h3 className="text-[15px] font-semibold text-zinc-100">{t("Pairing OpenCode Chat")}</h3>
        <p className="mt-1.5 max-w-[280px] text-[11.5px] leading-relaxed text-zinc-400">
          {t("Buka Notch Windows → Settings → Coding Agent → salin Kode pairing HP untuk membuka chat OpenCode di HP ini.")}
        </p>
        <div className="mt-4 w-full max-w-[260px]">
          <input
            type="text"
            value={pairCodeDraft}
            onChange={(e) => setPairCodeDraft(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitPairing();
            }}
            placeholder="ABCD2345"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={12}
            className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-center text-[14px] font-mono tracking-[0.25em] text-zinc-100 outline-none focus:border-sky-500/50"
            autoFocus
          />
          {pairingError && (
            <p className="mt-2 text-[11px] leading-relaxed text-red-400">
              {pairingError}
            </p>
          )}
          <button
            type="button"
            disabled={pairingSubmitting || !pairCodeDraft.trim()}
            onClick={() => void submitPairing()}
            className="mt-3 w-full rounded-xl bg-sky-500/20 py-2 text-[12px] font-semibold text-sky-300 border border-sky-500/30 hover:bg-sky-500/30 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            {pairingSubmitting ? t("Menghubungkan…") : t("Hubungkan Chat")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative flex h-full w-full flex-col font-sans text-zinc-200 ${mobile ? "px-1" : ""}`}>
      {/* Header: session picker, new session, connection state */}
      <div className={`flex shrink-0 items-center justify-between gap-2 ${mobile ? "py-0.5" : "border-b border-white/[0.05] py-1"}`}>
        <div className="relative flex min-w-0 items-center">
          <button
            type="button"
            onClick={() => setMenu(menu === "session" ? null : "session")}
            className={
              mobile
                ? "ca-chip"
                : "flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.10]"
            }
          >
            {!mobile && <ChatCircleDots size={12} />}
            <span className="max-w-[160px] truncate">
              {selected ? sessionLabel(selected) : t("Pilih sesi")}
            </span>
            <CaretDown size={mobile ? 13 : 10} weight="bold" className="shrink-0 text-zinc-400" />
          </button>

          {/* Session picker */}
          {menu === "session" && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
              <div className="absolute left-0 top-7 z-50 max-h-72 w-[min(20rem,85vw)] overflow-hidden rounded-xl border border-white/15 bg-[#16171d]/95 p-1.5 shadow-2xl backdrop-blur-xl flex flex-col">
                {/* Search Bar */}
                <div className="relative mb-1 flex items-center rounded-lg border border-white/10 bg-black/40 px-2 py-1">
                  <MagnifyingGlass size={12} className="shrink-0 text-zinc-500 mr-1.5" />
                  <input
                    type="text"
                    value={sessionSearch}
                    onChange={(e) => setSessionSearch(e.target.value)}
                    placeholder={t("Cari riwayat sesi…")}
                    className="w-full bg-transparent text-[11px] text-zinc-200 placeholder-zinc-500 outline-none"
                    autoFocus
                  />
                  {sessionSearch && (
                    <button
                      type="button"
                      onClick={() => setSessionSearch("")}
                      className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded cursor-pointer"
                    >
                      <X size={11} weight="bold" />
                    </button>
                  )}
                </div>

                {/* Quick New Session Button */}
                <button
                  type="button"
                  onClick={() => void createSession(sessionSearch.trim() || undefined)}
                  className="mb-1 flex w-full items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-left text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                >
                  <Plus size={11} weight="bold" />
                  <span>{sessionSearch.trim() ? t("Buat sesi dengan nama ini") : t("Buat sesi baru")}</span>
                </button>

                {/* Session list or Not Found */}
                <div className="max-h-56 overflow-y-auto pr-0.5">
                  {filteredSessions.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-4 px-2 text-center">
                      <p className="text-[11px] text-zinc-400">
                        {sessionSearch ? t("Sesi tidak ditemukan") : t("Belum ada sesi OpenCode")}
                      </p>
                      {sessionSearch && (
                        <button
                          type="button"
                          onClick={() => void createSession(sessionSearch.trim() || undefined)}
                          className="mt-2 flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[10.5px] font-medium text-emerald-300 hover:bg-emerald-500/25 transition-all cursor-pointer"
                        >
                          <Plus size={11} weight="bold" />
                          <span>{t("Buat sesi baru")}</span>
                        </button>
                      )}
                    </div>
                  )}
                  {filteredSessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(session.id);
                        setMenu(null);
                        setSessionSearch("");
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] transition-colors cursor-pointer ${
                        session.id === selectedId ? "bg-white/[0.10] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.06]"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{sessionLabel(session)}</span>
                      <span className="shrink-0 text-[10px] text-zinc-600">
                        {relativeTime(session.time.updated ?? session.time.created)}
                      </span>
                      {session.id === selectedId && <Check size={12} weight="bold" className="text-emerald-400" />}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {busy && (
            <button
              type="button"
              onClick={() => void interrupt()}
              className="flex items-center gap-1 rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/20"
            >
              <Stop size={11} weight="fill" />
              {t("Hentikan")}
            </button>
          )}
          <button
            type="button"
            onClick={() => void createSession()}
            disabled={creating}
            className={
              mobile
                ? "ca-ib"
                : "rounded-full border border-emerald-500/25 bg-emerald-500/10 p-1.5 text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:pointer-events-none disabled:opacity-40"
            }
            title={t("Sesi baru")}
          >
            <Plus size={mobile ? 18 : 12} weight="bold" />
          </button>
          <button
            type="button"
            onClick={() => {
              void loadSessions();
              if (selectedId) void loadMessages(selectedId);
            }}
            className={
              mobile
                ? "ca-ib"
                : "rounded-full border border-white/10 bg-white/[0.06] p-1.5 text-zinc-400 transition-colors hover:text-zinc-200"
            }
            title={t("Segarkan")}
          >
            <ArrowsClockwise size={mobile ? 18 : 12} weight={mobile ? "bold" : "regular"} />
          </button>
          {mobile && (
            <button
              type="button"
              onClick={() => {
                setPairCodeDraft(getCompanionToken());
                setPairingError(null);
                setNeedsPairing(true);
              }}
              className="ca-ib"
              title={t("Ubah kode pairing")}
            >
              <Key size={18} weight="bold" />
            </button>
          )}
        </div>
      </div>

      {/* Agent + model of the selected session */}
      <div className={`relative flex shrink-0 items-center gap-2 ${mobile ? "mt-1.5 mb-1" : "py-1"}`}>
        <button
          type="button"
          disabled={!selectedId}
          onClick={() => setMenu(menu === "agent" ? null : "agent")}
          className={
            mobile
              ? `ca-chip ${!selectedId ? "d opacity-60 pointer-events-none" : "d"}`
              : "flex min-w-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-zinc-400 transition-colors hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-40"
          }
          title={t("Ganti agent")}
        >
          {!mobile && <ChatCircleDots size={11} />}
          <span className="max-w-[100px] truncate">{selected?.agent ?? t("Agent")}</span>
          <CaretDown size={mobile ? 13 : 9} weight="bold" className="shrink-0 text-zinc-600" />
        </button>
        <button
          type="button"
          disabled={!selectedId}
          onClick={() => setMenu(menu === "model" ? null : "model")}
          className={
            mobile
              ? `ca-chip ${!selectedId ? "d opacity-60 pointer-events-none" : "d"}`
              : "flex min-w-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-zinc-400 transition-colors hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-40"
          }
          title={t("Ganti model")}
        >
          {!mobile && <Cpu size={11} />}
          <span className="max-w-[170px] truncate">{modelLabel ?? t("Model")}</span>
          <CaretDown size={mobile ? 13 : 9} weight="bold" className="shrink-0 text-zinc-600" />
        </button>

        {/* Agent picker */}
        {menu === "agent" && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
            <div className="absolute left-0 top-7 z-50 max-h-64 w-[min(17rem,80vw)] overflow-y-auto rounded-xl border border-white/15 bg-[#16171d]/95 p-1.5 shadow-2xl backdrop-blur-xl">
              {agents.length === 0 && (
                <div className="px-2 py-2 text-[11px] text-zinc-500">{t("Memuat agent…")}</div>
              )}
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => void switchAgent(agent.id)}
                  className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                    selected?.agent === agent.id
                      ? "bg-white/[0.10] text-zinc-100"
                      : "text-zinc-400 hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px]">{agent.name ?? agent.id}</span>
                    {agent.description && (
                      <span className="block truncate text-[10px] text-zinc-600">{agent.description}</span>
                    )}
                  </span>
                  {selected?.agent === agent.id && (
                    <Check size={12} weight="bold" className="mt-0.5 shrink-0 text-emerald-400" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Model picker */}
        {menu === "model" && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
            <div className="absolute left-0 top-7 z-50 w-[min(21rem,88vw)] overflow-hidden rounded-xl border border-white/15 bg-[#16171d]/95 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-2.5 py-1.5">
                <MagnifyingGlass size={11} className="shrink-0 text-zinc-500" />
                <input
                  autoFocus
                  value={modelQuery}
                  onChange={(event) => setModelQuery(event.target.value)}
                  placeholder={t("Cari model…")}
                  className="w-full bg-transparent text-[11.5px] text-zinc-200 outline-none placeholder:text-zinc-600"
                />
              </div>
              <div className="max-h-56 overflow-y-auto p-1.5">
                {models.length === 0 && (
                  <div className="px-2 py-2 text-[11px] text-zinc-500">{t("Memuat model…")}</div>
                )}
                {models.length > 0 && filteredModels.length === 0 && (
                  <div className="px-2 py-2 text-[11px] text-zinc-500">{t("Model tidak ditemukan.")}</div>
                )}
                {filteredModels.map((model) => {
                  const active =
                    selected?.model?.id === model.id &&
                    selected.model.providerID === model.providerID;
                  return (
                    <button
                      key={`${model.providerID}/${model.id}`}
                      type="button"
                      onClick={() => void switchModel(model)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                        active ? "bg-white/[0.10] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.06]"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate text-[11.5px]">
                        {model.name ?? model.id}
                      </span>
                      <span className="shrink-0 text-[10px] text-zinc-600">{model.providerID}</span>
                      {active && <Check size={12} weight="bold" className="shrink-0 text-emerald-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Transcript */}
      <div className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1 ${mobile ? "py-2" : "py-1.5"}`}>
        {error && (
          <div className="rounded-lg border border-red-500/25 bg-red-500/[0.08] px-2.5 py-1.5 text-[11px] leading-relaxed text-red-300">
            {error}
          </div>
        )}
        {!error && visible.length === 0 && (
          mobile ? (
            <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
              <div className="ca-ei" style={{ marginTop: 18 }}>
                <ChatCircleDots size={26} weight="bold" />
              </div>
              <b className="ca-et">
                {selectedId ? t("Sesi ini belum punya pesan.") : t("Pilih sesi")}
              </b>
              <p className="ca-ep">
                {selectedId ? t("Ketik instruksi untuk OpenCode atau paste screenshot…") : t("Pilih sesi untuk melihat isinya.")}
              </p>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 text-center text-[11.5px] text-zinc-500">
              {selectedId ? t("Sesi ini belum punya pesan.") : t("Pilih sesi untuk melihat isinya.")}
            </div>
          )
        )}
        {visible.map((message) => {
          if (message.type === "user") {
            return (
              <div key={message.id} className="flex flex-col items-end">
                <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-xs border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[12.5px] leading-relaxed text-zinc-100 select-text">
                  {message.text}
                </div>
              </div>
            );
          }
          if (message.type === "assistant") {
            return (
              <div key={message.id} className="flex flex-col items-start">
                <div className="max-w-[92%] rounded-2xl rounded-bl-xs border border-sky-500/25 bg-[#1c1d25] px-3 py-2 shadow-sm">
                  <AssistantParts message={message} />
                </div>
              </div>
            );
          }
          // Shell and compaction events are short system lines.
          return (
            <div key={message.id} className="flex items-center gap-1.5 px-1 text-[10.5px] text-zinc-600">
              <Wrench size={10} />
              <span className="truncate">{message.type === "shell" ? t("Perintah shell") : t("Konteks dipadatkan")}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      {mobile ? (
        <div className="mt-auto flex shrink-0 flex-col pt-1.5">
          {attachments.length > 0 && (
            <div className="flex items-center gap-1.5 mb-1.5 overflow-x-auto pb-0.5">
              {attachments.map((att, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11.5px] shrink-0"
                  style={{ background: "var(--cd)", borderColor: "var(--ln)", color: "var(--tx)" }}
                >
                  {att.previewUrl ? (
                    <img
                      src={att.previewUrl}
                      alt={att.name}
                      className="w-4 h-4 rounded object-cover"
                    />
                  ) : (
                    <FileText size={13} weight="bold" />
                  )}
                  <span className="max-w-[120px] truncate">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="p-0.5 rounded cursor-pointer"
                  >
                    <X size={11} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="ca-cp">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            {selectedId && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!selectedId || uploading || sending}
                className="ca-ib"
                title={t("Lampirkan file atau screenshot (bisa Ctrl+V)")}
              >
                <Paperclip size={20} weight="bold" className={uploading ? "animate-spin" : ""} />
              </button>
            )}
            <textarea
              ref={composerRef}
              value={draft}
              onPaste={handlePaste}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={1}
              disabled={!selectedId || sending}
              placeholder={
                selectedId
                  ? t("Ketik instruksi untuk OpenCode atau paste screenshot…")
                  : t("Pilih sesi dulu")
              }
              className={`max-h-24 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[14.5px] outline-none [scrollbar-width:none] ${!selectedId ? "pl-3" : ""}`}
              style={{ color: "var(--tx)" }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={!selectedId || sending || (!draft.trim() && attachments.length === 0)}
              className={`ca-sd ${!selectedId || sending || (!draft.trim() && attachments.length === 0) ? "d" : ""}`}
              title={t("Kirim")}
            >
              <ArrowUp size={18} weight="bold" />
            </button>
          </div>
        </div>
      ) : (
      <div className="mt-1 flex shrink-0 flex-col border-t border-white/[0.06] pt-1.5">
        {/* Attachment chips preview */}
        {attachments.length > 0 && (
          <div className="flex items-center gap-1.5 mb-1.5 overflow-x-auto pb-0.5">
            {attachments.map((att, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/10 border border-white/15 text-[11px] text-zinc-300 shrink-0"
              >
                {att.previewUrl ? (
                  <img
                    src={att.previewUrl}
                    alt={att.name}
                    className="w-3.5 h-3.5 rounded object-cover"
                  />
                ) : (
                  <FileText size={12} weight="bold" className="text-zinc-400" />
                )}
                <span className="max-w-[120px] truncate">{att.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="text-zinc-400 hover:text-white p-0.5 rounded hover:bg-white/10 cursor-pointer"
                >
                  <X size={10} weight="bold" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!selectedId || uploading || sending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition-colors disabled:pointer-events-none disabled:opacity-40 cursor-pointer"
            title={t("Lampirkan file atau screenshot (bisa Ctrl+V)")}
          >
            <Paperclip size={15} weight="bold" className={uploading ? "animate-spin" : ""} />
          </button>
          <textarea
            ref={composerRef}
            value={draft}
            onPaste={handlePaste}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={1}
            disabled={!selectedId || sending}
            placeholder={
              selectedId
                ? t("Ketik instruksi untuk OpenCode atau paste screenshot…")
                : t("Pilih sesi dulu")
            }
            className="max-h-24 min-h-[32px] flex-1 resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-500/40 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!selectedId || sending || (!draft.trim() && attachments.length === 0)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/15 text-sky-300 transition-colors hover:bg-sky-500/25 disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
            title={t("Kirim")}
          >
            <PaperPlaneRight size={13} weight="fill" />
          </button>
        </div>
      </div>
      )}

      {/* Footer: which OpenCode build we are talking to */}
      {!mobile && (
        <div className="mt-1 shrink-0 truncate text-[10px] text-zinc-600">
          {status?.connected
            ? `OpenCode ${status.version ?? ""} · ${status.url ?? ""}`
            : t("OpenCode tidak terhubung")}
        </div>
      )}
    </div>
  );
}
