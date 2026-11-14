import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsClockwise,
  Brain,
  CaretDown,
  ChatCircleDots,
  Check,
  Cpu,
  Key,
  MagnifyingGlass,
  PaperPlaneRight,
  Plus,
  Stop,
  Wrench,
} from "@phosphor-icons/react";
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
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
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

  const createSession = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const session = await opencodeService.createSession({
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

  const send = async () => {
    const text = draft.trim();
    if (!text || !selectedId || sending) return;
    setSending(true);
    setError(null);
    try {
      await opencodeService.prompt(selectedId, text);
      setDraft("");
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
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.05] py-1">
        <div className="relative flex min-w-0 items-center">
          <button
            type="button"
            onClick={() => setMenu(menu === "session" ? null : "session")}
            className="flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.10]"
          >
            <ChatCircleDots size={12} />
            <span className="max-w-[150px] truncate">
              {selected ? sessionLabel(selected) : t("Pilih sesi")}
            </span>
            <CaretDown size={10} weight="bold" className="shrink-0 text-zinc-400" />
          </button>

          {/* Session picker */}
          {menu === "session" && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
              <div className="absolute left-0 top-7 z-50 max-h-64 w-[min(19rem,80vw)] overflow-y-auto rounded-xl border border-white/15 bg-[#16171d]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                {sessions.length === 0 && (
                  <div className="px-2 py-2 text-[11px] text-zinc-500">{t("Belum ada sesi OpenCode")}</div>
                )}
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(session.id);
                      setMenu(null);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] transition-colors ${
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
            className="rounded-full border border-emerald-500/25 bg-emerald-500/10 p-1.5 text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:pointer-events-none disabled:opacity-40"
            title={t("Sesi baru")}
          >
            <Plus size={12} weight="bold" />
          </button>
          <button
            type="button"
            onClick={() => {
              void loadSessions();
              if (selectedId) void loadMessages(selectedId);
            }}
            className="rounded-full border border-white/10 bg-white/[0.06] p-1.5 text-zinc-400 transition-colors hover:text-zinc-200"
            title={t("Segarkan")}
          >
            <ArrowsClockwise size={12} />
          </button>
          {mobile && (
            <button
              type="button"
              onClick={() => {
                setPairCodeDraft(getCompanionToken());
                setPairingError(null);
                setNeedsPairing(true);
              }}
              className="rounded-full border border-white/10 bg-white/[0.06] p-1.5 text-zinc-400 transition-colors hover:text-zinc-200"
              title={t("Ubah kode pairing")}
            >
              <Key size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Agent + model of the selected session */}
      <div className="relative flex shrink-0 items-center gap-1.5 py-1">
        <button
          type="button"
          disabled={!selectedId}
          onClick={() => setMenu(menu === "agent" ? null : "agent")}
          className="flex min-w-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-zinc-400 transition-colors hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-40"
          title={t("Ganti agent")}
        >
          <ChatCircleDots size={11} />
          <span className="max-w-[80px] truncate">{selected?.agent ?? t("Agent")}</span>
          <CaretDown size={9} weight="bold" className="shrink-0 text-zinc-600" />
        </button>
        <button
          type="button"
          disabled={!selectedId}
          onClick={() => setMenu(menu === "model" ? null : "model")}
          className="flex min-w-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-zinc-400 transition-colors hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-40"
          title={t("Ganti model")}
        >
          <Cpu size={11} />
          <span className="max-w-[170px] truncate">{modelLabel ?? t("Model")}</span>
          <CaretDown size={9} weight="bold" className="shrink-0 text-zinc-600" />
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
          <div className="flex flex-1 items-center justify-center px-4 text-center text-[11.5px] text-zinc-500">
            {selectedId ? t("Sesi ini belum punya pesan.") : t("Pilih sesi untuk melihat isinya.")}
          </div>
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
      <div className="mt-1 flex shrink-0 items-end gap-1.5 border-t border-white/[0.06] pt-1.5">
        <textarea
          ref={composerRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          rows={1}
          disabled={!selectedId || sending}
          placeholder={selectedId ? t("Ketik pesan untuk OpenCode…") : t("Pilih sesi dulu")}
          className="max-h-24 min-h-[32px] flex-1 resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-500/40 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!selectedId || sending || !draft.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/15 text-sky-300 transition-colors hover:bg-sky-500/25 disabled:pointer-events-none disabled:opacity-30"
          title={t("Kirim")}
        >
          <PaperPlaneRight size={13} weight="fill" />
        </button>
      </div>

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
