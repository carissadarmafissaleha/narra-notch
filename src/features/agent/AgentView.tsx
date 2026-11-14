import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileCode,
  ChatCircleDots,
  TShirt,
  GearSix,
  SpeakerSimpleHigh,
  SpeakerSimpleSlash,
  X,
  Lightning,
  Check,
  Terminal,
  ArrowsClockwise,
  Trash,
} from "@phosphor-icons/react";
import {
  agentStore,
  initAgentStore,
  approvePendingTool,
  alwaysPendingTool,
  denyPendingTool,
  refreshGitDiff,
  clearDiffs,
  toggleHooks,
  toggleOpencodeHooks,
} from "./store";
import type { AgentStateView } from "./types";
import { agentService } from "../../platform/services";
import { fileName } from "./coucou/diff";
import { AgyIndicator } from "./AgyIndicator";
import { MochiCanvas } from "./MochiCanvas";
import { WardrobeView } from "./WardrobeView";
import { AgentChatBox } from "./AgentChatBox";
import { OpenCodeSessionView } from "./OpenCodeSessionView";
import { settings, updateSettings } from "../../settings/store";
import { resolveOutfit, type OutfitSelection } from "./coucou/wardrobe";
import { navigate } from "../../notch/nav";
import { requestSize } from "../../notch/size";
import { findTab } from "../../notch/tabs";
import { t } from "../../i18n";
import { createStore } from "../../lib/store";

/** Notch chrome above the overview body: top nav (38) + title header (32) + sub-tab bar (38) + body padding (8 top) + bottom breathing room (18). */
const OVERVIEW_CHROME = 38 + 32 + 38 + 8 + 18;
/** Mascot column height (canvas 90 + top padding). */
const OVERVIEW_MASCOT_H = 102;

export type AgentSubTab = "overview" | "chat" | "opencode" | "diff" | "wardrobe";
export const agentSubTabStore = createStore<{ tab: AgentSubTab }>({ tab: "overview" });

export function AgentView() {
  const s = agentStore.use();
  const set = settings.use();
  const trackCursor = set.codingAgent?.trackCursor ?? true;
  const soundEnabled = set.codingAgent?.soundEnabled ?? true;
  const outfitSelection = (set.codingAgent?.mochiOutfit || "auto") as OutfitSelection;
  const outfit = resolveOutfit(outfitSelection, new Date());
  const pending = s.pendingApproval;

  // Which agent is driving the notch. OpenCode wins when only its plugin is installed.
  const source: "antigravity" | "opencode" =
    s.source === "opencode" || (!s.isHookInstalled && s.isOpencodeHookInstalled)
      ? "opencode"
      : "antigravity";
  const agentLabel = source === "opencode" ? "OpenCode" : "Antigravity";
  const hooksInstalled =
    source === "opencode" ? Boolean(s.isOpencodeHookInstalled) : Boolean(s.isHookInstalled);
  // Before a hook is installed the page stays neutral: it is not yet known which agent will drive it.
  const displayLabel = hooksInstalled ? agentLabel : t("Coding Agent");
  const connectHooks = () =>
    source === "opencode" ? toggleOpencodeHooks(true) : toggleHooks(true);

  const { tab: activeTab } = agentSubTabStore.use();
  const setActiveTab = (tab: AgentSubTab) => agentSubTabStore.set({ tab });
  const chatEnabled = set.codingAgent?.chatEnabled ?? false;
  const opencodeChatEnabled = set.codingAgent?.opencodeChatEnabled ?? false;

  // Chat hidden in settings: never leave the sub-nav stuck on a hidden tab.
  useEffect(() => {
    if (!chatEnabled && activeTab === "chat") setActiveTab("overview");
  }, [chatEnabled, activeTab]);

  useEffect(() => {
    if (!opencodeChatEnabled && activeTab === "opencode") setActiveTab("overview");
  }, [opencodeChatEnabled, activeTab]);

  useEffect(() => {
    initAgentStore();
    agentService.isHookInstalled().then((installed) => {
      agentStore.set((cur) => ({ ...cur, isHookInstalled: installed }));
    });
  }, []);

  // Handle hotkeys (Y / Enter for allow, N / Esc for deny)
  useEffect(() => {
    if (!pending) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === "Enter" || e.key === "y" || e.key === "Y") && !e.shiftKey) {
        e.preventDefault();
        approvePendingTool(pending.id);
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        alwaysPendingTool(pending.id);
      } else if (e.key === "Escape" || e.key === "n" || e.key === "N") {
        e.preventDefault();
        denyPendingTool(pending.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pending]);

  const toggleSound = () => {
    updateSettings((cur) => ({
      ...cur,
      codingAgent: {
        ...cur.codingAgent,
        soundEnabled: !soundEnabled,
      },
    }));
  };

  const turboEnabled = !(set.codingAgent?.askPermissions ?? true);
  const toggleTurbo = () => {
    const nextAsk = !turboEnabled ? false : true;
    updateSettings((cur) => ({
      ...cur,
      codingAgent: {
        ...cur.codingAgent,
        askPermissions: nextAsk,
      },
    }));
  };

  const handleOpenSettings = () => {
    navigate("settings", "coding_agent");
  };

  // Hold finished state for at least 3.2s so celebration animation completes without flickering
  const [displayFinished, setDisplayFinished] = useState(false);
  const finishedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (s.status === "finished") {
      setDisplayFinished(true);
      if (finishedTimerRef.current) window.clearTimeout(finishedTimerRef.current);
      finishedTimerRef.current = window.setTimeout(() => {
        setDisplayFinished(false);
      }, 3500);
    }
  }, [s.status]);

  // Determine Bot State
  const isApproval = Boolean(pending) || s.status === "waiting_approval";
  const isFinished = (s.status === "finished" || displayFinished) && !isApproval;
  const isThinking = s.status === "thinking";
  const botState = isApproval
    ? "approval"
    : isFinished
    ? "finished"
    : isThinking
    ? "thinking"
    : s.status === "working" || s.status === "tool_running"
    ? "working"
    : "idle";

  // Overview is compact: the notch hugs its content instead of the full 420 px.
  // Approval / finished / chat / diff / wardrobe keep the tab's default size.
  const overviewMode = activeTab === "overview" && !isApproval && !isFinished;
  const [overviewH, setOverviewH] = useState(0);
  const measureRef = useRef<ResizeObserver | null>(null);
  const measure = useCallback((el: HTMLDivElement | null) => {
    measureRef.current?.disconnect();
    if (!el) return;
    const ro = new ResizeObserver(() => setOverviewH(Math.ceil(el.offsetHeight)));
    ro.observe(el);
    measureRef.current = ro;
  }, []);
  useEffect(() => {
    if (!overviewMode || overviewH <= 0) return requestSize("agent", null);
    const base = findTab("agent")!.size;
    const h = OVERVIEW_CHROME + Math.max(OVERVIEW_MASCOT_H, overviewH);
    requestSize("agent", { w: base.w, h: Math.min(base.h, h) });
  }, [overviewMode, overviewH]);
  useEffect(() => () => {
    requestSize("agent", null);
    agentSubTabStore.set({ tab: "overview" });
  }, []);

  return (
    <div className="flex h-full w-full flex-col select-none text-zinc-200 overflow-hidden font-sans">
      {/* ── TOP NAV HEADER (Coucou matching layout) ── */}
      <div className="flex h-[38px] shrink-0 items-center justify-between px-3 border-b border-white/[0.06]">
        {/* Left Navigation Tabs with clear labeled pills */}
        <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-[10px] border border-white/[0.08]">
          <button
            type="button"
            className={`flex items-center justify-center px-2.5 h-7 rounded-[8px] text-[11.5px] font-medium transition-all ${
              activeTab === "overview" && !isApproval && !isFinished
                ? "bg-white/15 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
            }`}
            title={t("Overview")}
            onClick={() => setActiveTab("overview")}
          >
            <Terminal size={14} weight="bold" />
          </button>

          {chatEnabled && (
            <button
              type="button"
              className={`flex items-center gap-1.5 px-2.5 h-7 rounded-[8px] text-[11.5px] font-medium transition-all ${
                activeTab === "chat" && !isApproval && !isFinished
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
              }`}
              onClick={() => setActiveTab("chat")}
            >
              <ChatCircleDots size={14} weight="bold" />
              <span>{t("Antigravity")}</span>
            </button>
          )}

          {opencodeChatEnabled && (
            <button
              type="button"
              className={`flex items-center gap-1.5 px-2.5 h-7 rounded-[8px] text-[11.5px] font-medium transition-all ${
                activeTab === "opencode" && !isApproval && !isFinished
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
              }`}
              title={t("Sesi OpenCode")}
              onClick={() => setActiveTab("opencode")}
            >
              <ChatCircleDots size={14} weight="bold" />
              <span>{t("OpenCode")}</span>
            </button>
          )}

          <button
            type="button"
            className={`flex items-center gap-1.5 px-2.5 h-7 rounded-[8px] text-[11.5px] font-medium transition-all ${
              activeTab === "diff"
                ? "bg-white/15 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
            }`}
            onClick={() => setActiveTab("diff")}
          >
            <FileCode size={14} weight="bold" />
            <span>{t("Diff")}</span>
          </button>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`flex h-7 items-center gap-1 rounded-[7px] px-2 text-[11px] font-semibold transition-all border ${
              turboEnabled
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] border-transparent"
            }`}
            title={
              turboEnabled
                ? t("Mode Turbo aktif: Izin disetujui otomatis")
                : t("Aktifkan Mode Turbo (Tanpa konfirmasi izin)")
            }
            onClick={toggleTurbo}
          >
            <Lightning
              size={13}
              weight={turboEnabled ? "fill" : "bold"}
              className={turboEnabled ? "text-amber-400" : ""}
            />
            <span>{t("Turbo")}</span>
          </button>
          <button
            type="button"
            className={`flex h-7 w-7 items-center justify-center rounded-[7px] transition-colors ${
              activeTab === "wardrobe"
                ? "bg-white/15 text-white"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
            }`}
            title={t("Wardrobe")}
            onClick={() => setActiveTab(activeTab === "wardrobe" ? "overview" : "wardrobe")}
          >
            <TShirt size={16} weight="bold" />
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-[7px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
            title={t("Einstellungen")}
            onClick={handleOpenSettings}
          >
            <GearSix size={17} weight="bold" />
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-[7px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
            title={soundEnabled ? t("Stumm") : t("Ton an")}
            onClick={toggleSound}
          >
            {soundEnabled ? (
              <SpeakerSimpleHigh size={17} weight="bold" />
            ) : (
              <SpeakerSimpleSlash size={17} weight="bold" />
            )}
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-[7px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
            title={t("Schließen")}
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))}
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      </div>

      {/* ── MAIN BODY CONTENT (Direct View, no inner card) ── */}
      <div className="relative flex-1 min-h-0 px-4 py-2">
        {/* VIEW 1: APPROVAL MODE */}
        {isApproval ? (
          <ApprovalCard
            command={pending?.command || pending?.tool || "run_command"}
            agentLabel={displayLabel}
            onAllow={() => {
              if (pending) approvePendingTool(pending.id);
            }}
            onAlways={() => {
              if (pending) alwaysPendingTool(pending.id);
            }}
            onDeny={() => {
              if (pending) denyPendingTool(pending.id);
            }}
            outfit={outfit}
            trackCursor={trackCursor}
          />
        ) : isFinished ? (
          /* VIEW 2: FINISHED MODE */
          <FinishedCard
            outfit={outfit}
            agentLabel={displayLabel}
            trackCursor={trackCursor}
            onClose={() => {
              setDisplayFinished(false);
              agentStore.set((cur) => ({ ...cur, status: "idle" }));
            }}
          />
        ) : (
          <>
            {/* VIEW 3: OVERVIEW VIEW - Kept mounted so BotEngine & Canvas persist */}
            <div
              className={`h-full w-full ${
                activeTab === "overview" ? "block animate-rise" : "hidden pointer-events-none"
              }`}
            >
              <OverviewSingleCard
                s={s}
                botState={botState}
                outfit={outfit}
                agentLabel={displayLabel}
                hooksInstalled={hooksInstalled}
                onConnect={connectHooks}
                trackCursor={trackCursor}
                chatEnabled={chatEnabled}
                opencodeChatEnabled={opencodeChatEnabled}
                measureRef={measure}
              />
            </div>

            {/* VIEW 4: CHAT VIEW */}
            {chatEnabled && activeTab === "chat" && (
              <div className="h-full w-full flex flex-col min-h-0 animate-rise p-1">
                <AgentChatBox fillHeight={true} />
              </div>
            )}

            {/* VIEW 4b: OPENCODE SESSION VIEW */}
            {activeTab === "opencode" && (
              <div className="h-full w-full flex flex-col min-h-0 animate-rise p-1">
                <OpenCodeSessionView />
              </div>
            )}

            {/* VIEW 5: CODE DIFF VIEW */}
            {activeTab === "diff" && (
              <div className="h-full w-full animate-rise">
                <DiffView s={s} />
              </div>
            )}

            {/* VIEW 6: WARDROBE VIEW */}
            {activeTab === "wardrobe" && (
              <div className="h-full w-full animate-rise">
                <WardrobeView onClose={() => setActiveTab("overview")} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── REUSABLE DYNAMIC STEPPER (Read, Edit, Bash, Done) ──
function AgentStepper({
  s,
  layout = "horizontal",
}: {
  s: AgentStateView;
  layout?: "horizontal" | "vertical";
}) {
  const isReadActive = s.currentToolCategory === "read" && s.status === "tool_running";
  const isEditActive = s.currentToolCategory === "edit" && s.status === "tool_running";
  const isBashActive = s.currentToolCategory === "bash" && s.status === "tool_running";
  const isDoneActive = Boolean(s.hasDone || s.status === "finished");

  const readItem = (
    <span
      className={`flex items-center gap-1 transition-colors ${
        isReadActive
          ? "text-emerald-400 font-semibold"
          : s.hasRead
          ? "text-emerald-400/90"
          : "text-zinc-500"
      }`}
    >
      {isReadActive ? (
        <AgyIndicator active={true} size={11} className="text-emerald-400" />
      ) : (
        <Check size={11} weight="bold" className={s.hasRead ? "text-emerald-400" : "opacity-35"} />
      )}
      {t("Lesen")}
    </span>
  );

  const editItem = (
    <span
      className={`flex items-center gap-1 transition-colors ${
        isEditActive
          ? "text-amber-400 font-semibold"
          : s.hasEdit
          ? "text-emerald-400/90"
          : "text-zinc-500"
      }`}
    >
      {isEditActive ? (
        <AgyIndicator active={true} size={11} className="text-amber-400" />
      ) : (
        <Check size={11} weight="bold" className={s.hasEdit ? "text-emerald-400" : "opacity-35"} />
      )}
      {t("Bearbeiten")}
    </span>
  );

  const bashItem = (
    <span
      className={`flex items-center gap-1 transition-colors ${
        isBashActive
          ? "text-cyan-400 font-semibold"
          : s.hasBash
          ? "text-emerald-400/90"
          : "text-zinc-500"
      }`}
    >
      {isBashActive ? (
        <AgyIndicator active={true} size={11} className="text-cyan-400" />
      ) : s.hasBash ? (
        <Check size={11} weight="bold" className="text-emerald-400" />
      ) : (
        <Terminal size={11} weight="bold" className="opacity-35" />
      )}
      {t("Terminal")}
    </span>
  );

  const doneItem = (
    <span
      className={`flex items-center gap-1 transition-colors ${
        isDoneActive
          ? "text-emerald-400 font-semibold"
          : "text-zinc-500"
      }`}
    >
      <Check size={11} weight="bold" className={isDoneActive ? "text-emerald-400" : "opacity-35"} />
      {t("Fertig")}
    </span>
  );

  if (layout === "vertical") {
    return (
      <div className="space-y-1.5 text-[11px] font-medium pl-0.5">
        <div>{readItem}</div>
        <div>{editItem}</div>
        <div>{bashItem}</div>
        <div>{doneItem}</div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 mt-2.5 text-[11px] font-medium text-zinc-400">
      {readItem}
      {editItem}
      {bashItem}
      {doneItem}
    </div>
  );
}

// ── OVERVIEW: compact card (the notch hugs its content height) ──
function OverviewSingleCard({
  s,
  botState,
  outfit,
  agentLabel,
  hooksInstalled,
  onConnect,
  trackCursor,
  chatEnabled,
  opencodeChatEnabled,
  measureRef,
}: {
  s: AgentStateView;
  botState: any;
  outfit: any;
  agentLabel: string;
  hooksInstalled: boolean;
  onConnect: () => void;
  trackCursor: boolean;
  chatEnabled: boolean;
  opencodeChatEnabled: boolean;
  /** Receives the natural-height content box so AgentView can size the notch to it. */
  measureRef?: (el: HTMLDivElement | null) => void;
}) {
  const isRunning = s.status === "tool_running" || s.status === "thinking";
  const currentAction =
    s.currentTool ||
    (s.status === "thinking"
      ? t("Agent denkt nach…")
      : s.status === "finished"
      ? t("Aufgabe erledigt")
      : t("Bereit"));

  return (
    <div className="relative flex h-full w-full items-start overflow-hidden">
      {/* Mascot on the left, with a soft halo in the theme tint */}
      <div className="relative w-[26%] shrink-0 flex items-start pt-1.5 justify-center pointer-events-auto cursor-pointer">
        <div
          aria-hidden
          className="absolute top-2 size-[110px] rounded-full blur-2xl pointer-events-none"
          style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--tint) 16%, transparent) 0%, transparent 70%)" }}
        />
        {/* Soft Amber Aura behind Mochi during Approval */}
        {botState === "approval" && (
          <div className="absolute top-0 size-[120px] rounded-full bg-amber-500/25 blur-2xl pointer-events-none animate-pulse" />
        )}
        {/* Soft Emerald Aura behind Mochi on Finished */}
        {botState === "finished" && (
          <div className="absolute top-0 size-[130px] rounded-full bg-emerald-500/20 blur-2xl pointer-events-none animate-pulse" />
        )}
        <MochiCanvas
          size={90}
          outfit={outfit}
          bodyColor={null} // Pure white pearl Coucou
          state={botState}
          trackCursor={trackCursor}
          glow={false}
          onEngineReady={(engine) => {
            setTimeout(() => {
              engine.greet();
            }, 350);
          }}
        />
      </div>

      {/* Content on the right: natural height (measured), scrolls only if it ever overflows */}
      <div className="relative min-w-0 flex-1 h-full overflow-y-auto pr-1 pl-1 [scrollbar-width:none]">
        <div ref={measureRef} className="flex flex-col pb-1">
          {/* Header: AGY CLI Braille indicator (spins when working, still when idle), name and connection badge */}
          <div className="flex items-center gap-1.5 mb-2.5">
            <AgyIndicator active={isRunning} size={13} className="mr-0.5" />
            <span className="text-[14px] font-bold text-white tracking-tight">{agentLabel}</span>
            {hooksInstalled && <span className="text-[12px] text-label-3 font-normal">{t("Agent")}</span>}
            {hooksInstalled ? (
              <span className="ml-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />
                <span>{t("Terhubung")}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  await onConnect();
                }}
                className="pressable ml-1.5 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-medium text-amber-300 hover:bg-amber-500/25 cursor-pointer"
                title={t("Klik untuk memasang hooks otomatis")}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                <span>{t("Belum Terhubung • Sambungkan")}</span>
              </button>
            )}
          </div>

          {!hooksInstalled ? (
            /* Hooks not installed: friendly 1-click onboarding */
            <div className="flex flex-col">
              <h3 className="text-[13px] font-bold text-white tracking-tight mb-1">
                {t("Hubungkan ke Coding Agent")}
              </h3>
              <p className="text-[11px] text-label-2 leading-relaxed max-w-[380px] mb-3">
                {t("Pasang hooks otomatis agar notch dapat mendeteksi aktivitas coding, menampilkan live diff, dan persetujuan perintah secara instan.")}
              </p>
              <button
                type="button"
                onClick={async () => {
                  await onConnect();
                }}
                className="pressable self-start flex items-center gap-2 rounded-full bg-tint text-black px-3.5 py-1.5 text-[11.5px] font-semibold hover:brightness-110 cursor-pointer"
                style={{ boxShadow: "0 4px 16px -4px color-mix(in srgb, var(--tint) 50%, transparent)" }}
              >
                <Lightning size={13} weight="fill" />
                <span>{t("Pasang Hooks Otomatis (1-Klik)")}</span>
              </button>
            </div>
          ) : (
            <>
              {/* Activity card: last prompt + current action + stepper */}
              <div className="rounded-xl bg-fill-1 border border-white/[0.06] px-3 py-2.5">
                <div className="font-mono text-[11px] text-label-3 truncate">
                  {s.lastInput ? `"${s.lastInput.slice(0, 64)}${s.lastInput.length > 64 ? "…" : ""}"` : t("Noch keine Eingabe")}
                </div>
                <div className="mt-1 flex items-center gap-2 font-mono text-[12.5px]">
                  {isRunning ? (
                    <>
                      <AgyIndicator active={true} size={13} />
                      <span className="truncate animate-agy-shimmer font-semibold tracking-tight">{currentAction}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-tint font-bold">›</span>
                      <span className="truncate text-label">{currentAction}</span>
                    </>
                  )}
                </div>
                {s.currentTool && (
                  <div className="mt-2 rounded-lg bg-black/60 border border-white/10 px-2.5 py-1.5">
                    <span className="font-mono text-[11px] text-amber-300 break-all select-text line-clamp-2">
                      {s.currentToolCategory === "bash" ? `$ ${s.currentTool}` : `› ${s.currentTool}`}
                    </span>
                  </div>
                )}
                <AgentStepper s={s} layout="horizontal" />
              </div>

              {/* Quick switch cards to Antigravity and/or OpenCode chat */}
              {(chatEnabled || opencodeChatEnabled) && (
                <div
                  className={`mt-2 ${
                    chatEnabled && opencodeChatEnabled ? "grid grid-cols-2 gap-2" : "flex flex-col"
                  }`}
                >
                  {chatEnabled && (
                    <button
                      type="button"
                      onClick={() => agentSubTabStore.set({ tab: "chat" })}
                      className="pressable flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-label-2 hover:text-white text-[12px] font-medium cursor-pointer transition-colors shadow-sm"
                      title={t("Buka Chat Antigravity")}
                    >
                      <ChatCircleDots size={15} weight="bold" className="text-tint shrink-0" />
                      <span className="truncate">Antigravity</span>
                    </button>
                  )}
                  {opencodeChatEnabled && (
                    <button
                      type="button"
                      onClick={() => agentSubTabStore.set({ tab: "opencode" })}
                      className="pressable flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-label-2 hover:text-white text-[12px] font-medium cursor-pointer transition-colors shadow-sm"
                      title={t("Buka Chat OpenCode")}
                    >
                      <ChatCircleDots size={15} weight="bold" className="text-tint shrink-0" />
                      <span className="truncate">OpenCode</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CODE DIFF VIEW (Clean Full Card, No Character, Real Active Diffs) ──
export function DiffView({ s }: { s: AgentStateView }) {
  const diffs = s.diffs || [];
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    refreshGitDiff();
  }, []);

  const activeDiff = diffs[selectedIdx] || diffs[0] || null;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshGitDiff();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const getExtBadge = (path: string) => {
    const ext = path.split(".").pop()?.toUpperCase() || "TXT";
    if (ext === "TS" || ext === "TSX") return { label: ext, bg: "bg-sky-500 text-black" };
    if (ext === "RS") return { label: "RS", bg: "bg-amber-600 text-white" };
    if (ext === "JSON") return { label: "JSON", bg: "bg-yellow-500 text-black" };
    if (ext === "CSS") return { label: "CSS", bg: "bg-blue-400 text-black" };
    if (ext === "JS" || ext === "JSX") return { label: ext, bg: "bg-yellow-400 text-black" };
    return { label: ext.slice(0, 4), bg: "bg-zinc-600 text-white" };
  };

  if (!activeDiff || (activeDiff.hunks.length === 0 && !activeDiff.tooLarge)) {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center text-center select-none py-4">
        <FileCode size={36} weight="light" className="text-zinc-600 mb-2.5" />
        <h4 className="text-[13.5px] font-semibold text-white tracking-tight">{t("Tidak ada perubahan file aktif")}</h4>
        <p className="text-[11.5px] text-zinc-500 max-w-[280px] mt-1 leading-relaxed">
          {t("Diff akan muncul secara otomatis saat Coding Agent mengedit file atau ada perubahan kode di workspace.")}
        </p>
        <button
          type="button"
          onClick={handleRefresh}
          className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-white/10 hover:bg-white/15 text-zinc-200 text-[11.5px] font-medium transition-colors"
        >
          <ArrowsClockwise size={13} weight="bold" className={isRefreshing ? "animate-spin" : ""} />
          <span>{t("Refresh Git Diff")}</span>
        </button>
      </div>
    );
  }

  const badge = getExtBadge(activeDiff.path);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden select-none">
      {/* Top File Switcher & Stats Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] text-[12px] gap-2">
        {/* Left: Files Tabs or Single File Name */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none min-w-0">
          <span className={`flex h-[18px] px-1.5 items-center justify-center rounded-[4px] font-extrabold text-[10px] tracking-tight shrink-0 ${badge.bg}`}>
            {badge.label}
          </span>
          {diffs.length > 1 ? (
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              {diffs.map((d, idx) => (
                <button
                  key={d.path}
                  type="button"
                  onClick={() => setSelectedIdx(idx)}
                  className={`px-2 py-0.5 rounded-[6px] text-[11px] font-mono transition-colors truncate max-w-[130px] ${
                    idx === selectedIdx
                      ? "bg-white/15 text-white font-semibold"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
                  }`}
                  title={d.path}
                >
                  {fileName(d.path)}
                </button>
              ))}
            </div>
          ) : (
            <span className="font-semibold text-white truncate max-w-[220px]">
              {fileName(activeDiff.path)}
            </span>
          )}
        </div>

        {/* Right: Path, Add/Remove Counters, Refresh, and Clear */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono text-emerald-400 font-semibold">
            +{activeDiff.added}
          </span>
          <span className="text-[11px] font-mono text-red-400 font-semibold">
            -{activeDiff.removed}
          </span>
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            title={t("Refresh Git Diff")}
            onClick={handleRefresh}
          >
            <ArrowsClockwise size={12} weight="bold" className={isRefreshing ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 hover:text-red-400 hover:bg-white/10 transition-colors"
            title={t("Hapus riwayat diff")}
            onClick={() => clearDiffs()}
          >
            <Trash size={12} weight="bold" />
          </button>
        </div>
      </div>

      {/* Code Diff Lines Viewer */}
      <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-[18px] pt-2 scrollbar-none select-text">
        {(() => {
          let renderedLinesCount = 0;
          const MAX_LINES = 250;
          let reachedLimit = false;

          return (
            <>
              {activeDiff.hunks.map((hunk, hIdx) => {
                if (reachedLimit) return null;
                return (
                  <div key={hIdx} className="mb-2">
                    {/* Hunk Header */}
                    <div className="text-[10px] text-zinc-600 bg-white/[0.02] px-2 py-0.5 rounded select-none mb-1">
                      @@ -{hunk.origStart} +{hunk.newStart} @@
                    </div>

                    {/* Hunk Lines */}
                    {hunk.lines.map((line, lIdx) => {
                      if (renderedLinesCount >= MAX_LINES) {
                        reachedLimit = true;
                        return null;
                      }
                      renderedLinesCount++;

                      if (line.kind === "added") {
                        return (
                          <div key={lIdx} className="flex items-start -mx-2 px-2 bg-emerald-500/15 text-emerald-300">
                            <span className="w-7 text-right pr-2 select-none text-emerald-500/60 font-mono text-[10px]">
                              {line.newLine > 0 ? line.newLine : ""}
                            </span>
                            <span className="text-emerald-400 font-bold select-none mr-2">+</span>
                            <span className="flex-1 whitespace-pre-wrap break-all">{line.text}</span>
                          </div>
                        );
                      }
                      if (line.kind === "removed") {
                        return (
                          <div key={lIdx} className="flex items-start -mx-2 px-2 bg-red-500/15 text-red-300">
                            <span className="w-7 text-right pr-2 select-none text-red-500/60 font-mono text-[10px]">
                              {line.origLine > 0 ? line.origLine : ""}
                            </span>
                            <span className="text-red-400 font-bold select-none mr-2">-</span>
                            <span className="flex-1 whitespace-pre-wrap break-all line-through decoration-red-400/50">{line.text}</span>
                          </div>
                        );
                      }
                      return (
                        <div key={lIdx} className="flex items-start text-zinc-400 hover:bg-white/[0.02]">
                          <span className="w-7 text-right pr-2 select-none text-zinc-600 font-mono text-[10px]">
                            {line.newLine > 0 ? line.newLine : line.origLine}
                          </span>
                          <span className="w-4 select-none mr-1" />
                          <span className="flex-1 whitespace-pre-wrap break-all">{line.text}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {reachedLimit && (
                <div className="py-2 text-center text-[10.5px] text-zinc-500 bg-white/[0.02] rounded my-2">
                  {t("Menampilkan 250 baris pertama untuk responsivitas maksimal")}
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ── APPROVAL CARD (Amber wash gradient) ──
function ApprovalCard({
  command,
  agentLabel,
  onAllow,
  onAlways,
  onDeny,
  outfit,
  trackCursor,
}: {
  command: string;
  agentLabel: string;
  onAllow: () => void;
  onAlways: () => void;
  onDeny: () => void;
  outfit: any;
  trackCursor: boolean;
}) {
  return (
    <div className="relative flex h-full w-full items-center overflow-hidden">


      {/* Mascot with Bang Badge (30% column) */}
      <div className="relative w-[30%] shrink-0 flex items-center justify-center z-10">
        <MochiCanvas
          size={90}
          outfit={outfit}
          bodyColor={null}
          state="approval"
          trackCursor={trackCursor}
          glow={false}
        />
      </div>

      {/* Details & Actions (70% column) */}
      <div className="relative w-[70%] flex flex-col justify-center min-w-0 pl-2 z-10">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
          <span className="text-[13px] font-bold text-white">{agentLabel}</span>
          <span className="text-[12px] text-zinc-400">{t("memerlukan izin")}</span>
        </div>

        {/* Command block */}
        <div className="rounded-[8px] bg-black/40 border border-white/[0.08] px-3 py-1.5 font-mono text-[12px] text-amber-200 truncate mb-3">
          {command}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/15 px-3.5 py-1 text-[12px] font-medium text-zinc-200 border border-white/10 transition-colors"
            onClick={onDeny}
          >
            <span>{t("Deny")}</span>
            <span className="rounded bg-black/30 px-1 py-0.2 text-[10px] text-zinc-400">N</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black px-4 py-1 text-[12px] font-semibold transition-colors shadow-sm"
            onClick={onAllow}
          >
            <span>{t("Allow")}</span>
            <span className="rounded bg-black/20 px-1 py-0.2 text-[10px] text-black/70">Y</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/20 text-white px-3.5 py-1 text-[12px] font-semibold transition-colors border border-white/15 shadow-sm"
            onClick={onAlways}
            title={t("Selalu izinkan untuk sesi ini")}
          >
            <span>{t("Always")}</span>
            <span className="rounded bg-black/30 px-1 py-0.2 text-[10px] text-white/70">A</span>
          </button>
          <button
            type="button"
            className="text-[11.5px] text-zinc-400 hover:text-zinc-200 ml-2 transition-colors underline underline-offset-2"
            onClick={onAllow}
          >
            {t("Reply in terminal")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FINISHED CARD (Green wash gradient ala Screenshot 4) ──
function FinishedCard({
  outfit,
  agentLabel,
  trackCursor,
  onClose,
}: {
  outfit: any;
  agentLabel: string;
  trackCursor: boolean;
  onClose: () => void;
}) {
  return (
    <div className="relative flex h-full w-full items-center overflow-hidden">
      {/* Green wash glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(280px 280px at 50% 120%, rgba(34, 197, 94, 0.22) 0%, transparent 70%)",
        }}
      />

      {/* Happy Mochi (30% column) */}
      <div className="relative w-[30%] shrink-0 flex items-center justify-center z-10">
        <MochiCanvas
          size={90}
          outfit={outfit}
          bodyColor={null}
          state="finished"
          trackCursor={trackCursor}
          glow={false}
        />
      </div>

      {/* Text and Actions (70% column) */}
      <div className="relative w-[70%] flex flex-col justify-center min-w-0 pl-2 z-10">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="h-2 w-2 rounded-full bg-[#38BDF8] shadow-[0_0_8px_#38BDF8]" />
          <span className="text-[13px] font-bold text-white">{agentLabel}</span>
          <span className="text-[12px] text-zinc-400">{t("Session finished")}</span>
        </div>

        <h3 className="text-[18px] font-bold text-white tracking-tight mb-3">
          {t("Session finished")}
        </h3>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full bg-white text-black hover:bg-zinc-200 px-4 py-1 text-[12px] font-semibold transition-colors shadow-sm"
            onClick={onClose}
          >
            {t("Open terminal")}
          </button>
          <button
            type="button"
            className="rounded-full bg-white/10 hover:bg-white/15 text-zinc-200 px-4 py-1 text-[12px] font-medium border border-white/10 transition-colors"
            onClick={onClose}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
