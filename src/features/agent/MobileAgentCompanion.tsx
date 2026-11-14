import { useEffect, useState, useRef } from "react";
import {
  FileCode,
  ChatCircleDots,
  TShirt,
  SpeakerSimpleHigh,
  SpeakerSimpleSlash,
  Check,
  Terminal,
  ArrowsClockwise,
  Bell,
  BellSlash,
  Moon,
  Sun,
} from "@phosphor-icons/react";
import {
  agentStore,
  initAgentStore,
  approvePendingTool,
  alwaysPendingTool,
  denyPendingTool,
  refreshGitDiff,
} from "./store";
import { DiffView } from "./AgentView";
import { AgentChatBox } from "./AgentChatBox";
import { OpenCodeSessionView } from "./OpenCodeSessionView";
import { MochiCanvas } from "./MochiCanvas";
import { WardrobeView } from "./WardrobeView";
import { settings, updateSettings } from "../../settings/store";
import { resolveOutfit, type OutfitSelection } from "./coucou/wardrobe";
import { AgyIndicator } from "./AgyIndicator";
import type { BotEngine } from "./coucou/engine";
import {
  playApprovalAlert,
  playCoucouSound,
  playAgentSound,
  unlockMobileAudio,
} from "../../lib/agentSound";
import {
  companionEventUrl,
  companionFetch,
  getCompanionServerUrl,
  setCompanionServerUrl,
} from "../../platform/companionUrl";
import {
  initPwaNotifications,
  onApprovalNotificationAction,
  requestNotificationPermission,
  sendPwaNotification,
} from "../../lib/pwaNotification";
import { Capacitor } from "@capacitor/core";
import { APP_VERSION } from "../../lib/appVersion";
import {
  applyMobileTheme,
  getMobileTheme,
  saveMobileTheme,
  type MobileTheme,
} from "../../lib/mobileTheme";

// Android WebViews always name themselves in the UA; Capacitor's platform lookup
// can lag behind, which made the Android APK label itself "iOS" in the footer.
const PLATFORM = /android/i.test(navigator.userAgent) ? "android" : Capacitor.getPlatform();
const PLATFORM_LABEL = PLATFORM === "ios" ? "iOS" : PLATFORM === "android" ? "Android" : "PWA";
import { buildFileDiff, fileName } from "./coucou/diff";
import { t } from "../../i18n";

export type MobileTab = "overview" | "chat" | "opencode" | "diff" | "wardrobe";

export function MobileAgentCompanion() {
  const s = agentStore.use();
  const set = settings.use();
  const [tab, setTab] = useState<MobileTab>("overview");
  const [theme, setTheme] = useState<MobileTheme>(getMobileTheme);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [desktopVersion, setDesktopVersion] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  // window.prompt never prefills on Capacitor Android and looks out of place → use an in-app dialog.
  const [serverUrlOpen, setServerUrlOpen] = useState(false);
  const [serverUrlDraft, setServerUrlDraft] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const engineRef = useRef<BotEngine | null>(null);

  const soundEnabled = set.codingAgent?.soundEnabled ?? true;
  const notifEnabled = set.codingAgent?.notificationsEnabled ?? true;
  const chatEnabled = set.codingAgent?.chatEnabled ?? false;
  const opencodeChatEnabled = set.codingAgent?.opencodeChatEnabled ?? false;

  // Desktop owns the setting: when it is off, the chat is hidden here too.
  const applyChatEnabled = (value: unknown) => {
    if (typeof value !== "boolean") return;
    updateSettings((cur) =>
      cur.codingAgent?.chatEnabled === value
        ? cur
        : { ...cur, codingAgent: { ...cur.codingAgent, chatEnabled: value } },
    );
  };

  const applyOpencodeChatEnabled = (value: unknown) => {
    if (typeof value !== "boolean") return;
    updateSettings((cur) =>
      cur.codingAgent?.opencodeChatEnabled === value
        ? cur
        : { ...cur, codingAgent: { ...cur.codingAgent, opencodeChatEnabled: value } },
    );
  };
  // Keep the SSE handler stable: toggling notifications must not reconnect SSE.
  const notifEnabledRef = useRef(notifEnabled);
  notifEnabledRef.current = notifEnabled;

  // Save the PC address, then verify before reloading so a typo does not leave the phone staring at an empty screen.
  const saveConnection = async () => {
    setServerError(null);
    if (serverUrlDraft.trim()) setCompanionServerUrl(serverUrlDraft.trim());
    try {
      await companionFetch("/api/status");
      window.location.reload();
    } catch {
      setServerError(
        t("Server PC tidak bisa dihubungi. Pastikan HP dan PC ada di Wi-Fi yang sama."),
      );
    }
  };

  // Priority: 1. LocalStorage saved outfit (so refresh restores instantly) -> 2. settings store -> 3. "auto"
  const savedOutfit = (typeof window !== "undefined" ? localStorage.getItem("mochi:outfit") : null) as OutfitSelection | null;
  const outfitSelection = (savedOutfit || set.codingAgent?.mochiOutfit || "auto") as OutfitSelection;
  const outfit = resolveOutfit(outfitSelection, new Date());
  const pending = s.pendingApproval;

  // Initialize companion store, notifications, and SSE
  useEffect(() => {
    initAgentStore();
    void initPwaNotifications();

    // Tell the desktop which build this phone runs, so Settings can show it.
    const reportedPlatform = PLATFORM;
    void companionFetch("/api/client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: APP_VERSION,
        platform: reportedPlatform,
      }),
    }).catch(() => {});

    // Notification actions (Allow / Always / Deny) answer without opening the app UI.
    let disposeActions: (() => void) | undefined;
    void onApprovalNotificationAction((id, decision) => {
      if (decision === "deny") void denyPendingTool(id);
      else if (decision === "always") void alwaysPendingTool(id);
      else void approvePendingTool(id);
    }).then((dispose) => {
      disposeActions = dispose;
    });

    // Fetch desktop info to get desktop app version
    companionFetch("/api/info")
      .then((r) => r.json())
      .then((info) => {
        if (info?.desktopVersion) setDesktopVersion(info.desktopVersion);
      })
      .catch(() => {});

    // Desktop settings (language, outfit, chat visibility). Called on start and by
    // the ping below, so sync survives when SSE is blocked (Android).
    const syncSettings = () =>
      companionFetch("/api/settings")
        .then((r) => r.json())
        .then((d) => {
          if (d?.language) {
            updateSettings((cur) =>
              cur.language === d.language ? cur : { ...cur, language: d.language },
            );
          }
          if (d?.outfit) {
            try {
              localStorage.setItem("mochi:outfit", d.outfit);
            } catch {}
            updateSettings((cur) =>
              cur.codingAgent?.mochiOutfit === d.outfit
                ? cur
                : {
                    ...cur,
                    codingAgent: {
                      ...cur.codingAgent,
                      mochiOutfit: d.outfit,
                    },
                  },
            );
          }
          applyChatEnabled(d?.chatEnabled);
          applyOpencodeChatEnabled(d?.opencodeChatEnabled);
        })
        .catch(() => {});

    void syncSettings();

    // Connection badge follows a plain HTTP fetch: Android's WebView blocks http
    // EventSource from the https://localhost origin even with mixed content allowed.
    let alive = true;
    const ping = () => {
      companionFetch("/api/info")
        .then(async (r) => {
          if (!alive) return;
          setIsConnected(r.ok);
        })
        .catch(() => { if (alive) setIsConnected(false); });
      void syncSettings();
    };
    ping();
    const pingId = window.setInterval(ping, 5000);

    // In mobile browser environment, connect to SSE events for real-time live updates
    if (typeof window !== "undefined" && typeof EventSource !== "undefined") {
      const evtSource = new EventSource(companionEventUrl("/api/events"));

      // SSE failing is not fatal: the ping above owns the connection badge.
      evtSource.onopen = () => {
        setIsConnected(true);
      };

      evtSource.onmessage = async (e) => {
        try {
          const msg = JSON.parse(e.data);

          // Realtime language synchronization from desktop
          if (msg.language) {
            updateSettings((cur) =>
              cur.language === msg.language ? cur : { ...cur, language: msg.language },
            );
          }
          if (msg.type === "settings://language" && msg.data?.language) {
            updateSettings((cur) =>
              cur.language === msg.data.language
                ? cur
                : { ...cur, language: msg.data.language },
            );
          }

          // Chat visibility follows the Windows notch (init + settings://chat / settings://opencode_chat).
          applyChatEnabled(msg.chatEnabled ?? msg.data?.chatEnabled);
          applyOpencodeChatEnabled(msg.opencodeChatEnabled ?? msg.data?.opencodeChatEnabled);
          if (msg.type === "settings://opencode_chat" && typeof msg.data?.opencodeChatEnabled === "boolean") {
            applyOpencodeChatEnabled(msg.data.opencodeChatEnabled);
          }

          // Realtime outfit synchronization
          if (msg.outfit || (msg.type === "settings://outfit" && msg.data?.outfit)) {
            const nextOutfit = msg.outfit || msg.data?.outfit;
            try {
              localStorage.setItem("mochi:outfit", nextOutfit);
            } catch {}
            updateSettings((cur) => ({
              ...cur,
              codingAgent: {
                ...cur.codingAgent,
                mochiOutfit: nextOutfit,
              },
            }));
          }

          if (msg.type === "agent://state_changed" || msg.type === "init") {
            const next = msg.state || msg.data;
            const prev = agentStore.get();

            // Sound: gentle start chime when agent begins working from idle
            if (prev.status === "idle" && (next?.status === "working" || next?.status === "thinking")) {
              playAgentSound("start");
            }

            // When task/session finishes: play finish chime only (no banner/notification spam)
            if (prev.status !== "finished" && next?.status === "finished") {
              playAgentSound("done");
              refreshGitDiff();
            }

            agentStore.set((cur) => ({ ...cur, ...next, diffs: cur.diffs }));
          } else if (msg.type === "agent://pending_approval") {
            agentStore.set((cur) => ({
              ...cur,
              pendingApproval: msg.data,
              status: "waiting_approval",
            }));
            if (notifEnabledRef.current) {
              const shown = await sendPwaNotification(t("Requires execution approval"), {
                body:
                  msg.data?.command ||
                  msg.data?.tool ||
                  `${agentStore.get().source === "opencode" ? "OpenCode" : "Antigravity"} Agent`,
                tag: "narra-approval",
                renotify: true,
                toastType: "approval",
                approvalId: msg.data?.id,
                sound: "default",
              });
              // Native iOS banner already plays its own alert sound + haptic.
              // Only fall back to the in-app Coucou chime when no system banner was shown.
              if (!shown) playApprovalAlert();
            } else {
              playApprovalAlert();
            }
          } else if (msg.type === "agent://tool_call") {
            const { tool, category, payload } = msg.data || {};
            const cat =
              category ||
              (/edit|write|patch/i.test(tool)
                ? "edit"
                : /command|bash|terminal|run|exec/i.test(tool)
                ? "bash"
                : "read");

            // Filtered tool audio: edit & bash only (read is muted), gentle volume & debounced
            playAgentSound(cat as any);

            const args =
              payload?.toolCall?.args ||
              payload?.tool_call?.args ||
              payload?.args ||
              {};
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
          }
        } catch {}
      };

      return () => {
        alive = false;
        window.clearInterval(pingId);
        evtSource.close();
        disposeActions?.();
      };
    }
    return () => {
      alive = false;
      window.clearInterval(pingId);
      disposeActions?.();
    };
  }, []);

  const toggleTheme = () => {
    const next: MobileTheme = theme === "light" ? "dark" : "light";
    setTheme(next);
    saveMobileTheme(next);
    applyMobileTheme(next);
  };

  const toggleSound = () => {
    unlockMobileAudio();
    updateSettings((cur) => ({
      ...cur,
      codingAgent: {
        ...cur.codingAgent,
        soundEnabled: !soundEnabled,
      },
    }));
  };

  const toggleNotification = async () => {
    unlockMobileAudio();
    playCoucouSound("pop");

    const nextVal = !notifEnabled;
    updateSettings((cur) => ({
      ...cur,
      codingAgent: {
        ...cur.codingAgent,
        notificationsEnabled: nextVal,
      },
    }));

    if (nextVal) {
      // Ask iOS for permission silently — do not fire a test banner.
      await requestNotificationPermission();
    }
  };

  // Celebration plays fully (3.5s) then the card dismisses itself — no lingering "Session finished" screen.
  const [displayFinished, setDisplayFinished] = useState(false);
  const finishedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (s.status === "finished") {
      setDisplayFinished(true);
      if (finishedTimerRef.current) window.clearTimeout(finishedTimerRef.current);
      finishedTimerRef.current = window.setTimeout(() => {
        setDisplayFinished(false);
        agentStore.set((cur) => (cur.status === "finished" ? { ...cur, status: "idle" } : cur));
      }, 3500);
    }
  }, [s.status]);

  // Chat disabled from the desktop: leave the hidden tab and collapse fullscreen chat.
  useEffect(() => {
    if (chatEnabled) return;
    setTab((cur) => (cur === "chat" ? "overview" : cur));
    setIsChatExpanded(false);
  }, [chatEnabled]);

  useEffect(() => {
    if (opencodeChatEnabled) return;
    setTab((cur) => (cur === "opencode" ? "overview" : cur));
  }, [opencodeChatEnabled]);

  const isApproval = Boolean(pending) || s.status === "waiting_approval";
  const isFinished = (s.status === "finished" || displayFinished) && !isApproval;
  const isThinking = s.status === "thinking";
  const isWorking = s.status === "working" || s.status === "tool_running";

  const botState = isApproval
    ? "approval"
    : isFinished
    ? "finished"
    : isThinking
    ? "thinking"
    : isWorking
    ? "working"
    : "idle";

  const agentLabel = s.source === "opencode" ? "OpenCode" : "Antigravity";

  const handleAllow = () => {
    unlockMobileAudio();
    if (pending) {
      approvePendingTool(pending.id);
    }
  };

  const handleAlways = async () => {
    unlockMobileAudio();
    if (pending) {
      await alwaysPendingTool(pending.id);
    }
  };

  const handleDeny = () => {
    unlockMobileAudio();
    if (pending) {
      denyPendingTool(pending.id);
    }
  };

  // Parse tool name and tool target, e.g. "run_command · Invoke-RestMethod ..."
  const toolParts = (s.currentTool || "").split(" · ");
  const toolName = toolParts[0] || "";
  const toolTarget = toolParts.slice(1).join(" · ") || "";

  // 1. TOP ACTION TEXT (Action shimmer ticker in the middle card)
  const isRunning = isWorking || isThinking;
  const topActionText = isApproval
    ? t("Requires execution approval")
    : isFinished
    ? t("Task finished!")
    : toolName === "run_command" || s.currentToolCategory === "bash"
    ? `${t("Executing")} ${toolName || "command"}...`
    : toolName === "edit_file" || s.currentToolCategory === "edit"
    ? `${t("Editing")} ${toolTarget ? fileName(toolTarget) : toolName}...`
    : toolName === "read_file" || s.currentToolCategory === "read"
    ? `${t("Reading")} ${toolTarget ? fileName(toolTarget) : toolName}...`
    : s.currentTool
    ? s.currentTool
    : isThinking
    ? t("Analyzing...")
    : isWorking
    ? t("Executing command...")
    : t("Ready");

  // 2. BOTTOM COMMAND BOX TEXT (The raw terminal command line or file target path)
  const commandBoxText = isApproval
    ? pending?.command || pending?.tool || t("Requires execution approval")
    : isFinished
    ? t("Task finished!")
    : toolTarget
    ? (s.currentToolCategory === "bash" || toolName === "run_command"
        ? `$ ${toolTarget}`
        : `› ${toolTarget}`)
    : s.currentTool
    ? (s.currentToolCategory === "bash" ? `$ ${s.currentTool}` : `› ${s.currentTool}`)
    : s.lastInput
    ? `› "${s.lastInput}"`
    : `powershell › ${agentLabel} Agent Ready`;

  return (
    <div
      onClick={unlockMobileAudio}
      className={`mobile-${theme} fixed inset-0 h-[100dvh] w-full ${
        theme === "light" ? "bg-[#f2f2f7] text-zinc-900" : "bg-black text-white"
      } flex flex-col items-center font-sans overflow-hidden px-3 sm:px-4 transition-colors duration-200`}
      style={{
        paddingTop: "max(calc(env(safe-area-inset-top, 0px) + 20px), 52px)",
        paddingBottom: "max(calc(env(safe-area-inset-bottom, 0px) + 12px), 16px)",
      }}
    >
      {/* ── TOP STATUS BAR ── */}
      <header className="w-full max-w-[480px] sm:max-w-xl flex items-center justify-between h-10 px-1 mb-2 shrink-0">
        <div className="flex min-w-0 items-center text-[19px] sm:text-[20px] tracking-tight text-white select-none">
          <span className="italic font-normal text-white/90">Coding</span><span className="font-bold text-white">Agent</span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Dark / light switch for the phone shell */}
          <button
            type="button"
            onClick={toggleTheme}
            className={`flex h-7 w-7 items-center justify-center rounded-[8px] border transition-colors cursor-pointer active:scale-95 ${
              theme === "light"
                ? "text-amber-500 bg-amber-500/15 border-amber-500/35"
                : "text-zinc-400 hover:text-zinc-200 bg-white/[0.04] border-white/[0.08]"
            }`}
            title={theme === "light" ? t("Dunkler Modus") : t("Heller Modus")}
          >
            {theme === "light" ? (
              <Moon size={15} weight="bold" />
            ) : (
              <Sun size={15} weight="bold" />
            )}
          </button>

          {/* Connection status badge (tap to configure PC server IP) */}
          <button
            type="button"
            onClick={() => {
              setServerUrlDraft(getCompanionServerUrl() || "http://192.168.1.25:1421");
              setServerError(null);
              setServerUrlOpen(true);
            }}
            title={t("Klik untuk mengatur alamat server PC")}
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold transition-colors cursor-pointer active:scale-95 ${
              isConnected
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-red-500/10 border-red-500/20 text-red-400"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-red-400"
              }`}
            />
            <span>
              {isConnected
                ? t("Connected")
                : t("Disconnected")}
            </span>
          </button>

          {/* Wardrobe toggle button - icon only beside bell */}
          <button
            type="button"
            onClick={() => setTab(tab === "wardrobe" ? "overview" : "wardrobe")}
            className={`flex h-7 w-7 items-center justify-center rounded-[8px] border transition-colors cursor-pointer active:scale-95 ${
              tab === "wardrobe"
                ? "text-sky-400 bg-sky-500/15 border-sky-500/35 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 bg-white/[0.04] border-white/[0.08]"
            }`}
            title={t("Wardrobe")}
          >
            <TShirt size={15} weight="bold" />
          </button>

          {/* Web Push & In-App Notification toggle button */}
          <button
            type="button"
            onClick={toggleNotification}
            className={`flex h-7 w-7 items-center justify-center rounded-[8px] border transition-colors cursor-pointer active:scale-95 ${
              notifEnabled
                ? "text-amber-400 bg-amber-500/15 border-amber-500/35 shadow-sm"
                : "text-zinc-500 hover:text-zinc-300 bg-white/[0.04] border-white/[0.08]"
            }`}
            title={notifEnabled ? t("Notifications On") : t("Notifications Off")}
          >
            {notifEnabled ? (
              <Bell size={15} weight="fill" />
            ) : (
              <BellSlash size={15} weight="bold" />
            )}
          </button>

          {/* Sound Mute/Unmute toggle */}
          <button
            type="button"
            onClick={toggleSound}
            className={`flex h-7 w-7 items-center justify-center rounded-[8px] border transition-colors cursor-pointer active:scale-95 ${
              soundEnabled
                ? "text-zinc-300 bg-white/[0.06] border-white/[0.12]"
                : "text-zinc-500 bg-white/[0.02] border-white/[0.06]"
            }`}
            title={soundEnabled ? t("Mute") : t("Unmute")}
          >
            {soundEnabled ? (
              <SpeakerSimpleHigh size={15} weight="bold" />
            ) : (
              <SpeakerSimpleSlash size={15} weight="bold" />
            )}
          </button>
        </div>
      </header>

      {/* ── 1. MOCHI SECTION & 2. MIDDLE CARD (Collapsible in Full-Screen Chat Mode) ── */}
      {!isChatExpanded && (
        <>
          <section className="relative flex flex-col items-center justify-center my-3 sm:my-5 shrink-0 animate-in fade-in duration-200">
            {/* Soft Amber Aura behind Mochi during Approval */}
            {isApproval && (
              <div className="absolute w-60 h-60 rounded-full bg-amber-500/25 blur-3xl pointer-events-none animate-pulse" />
            )}

            {/* Soft Emerald Aura behind Mochi on Finished */}
            {isFinished && (
              <div className="absolute w-64 h-64 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none animate-pulse" />
            )}

            <div className="relative cursor-pointer">
              <MochiCanvas
                size={175}
                state={botState}
                outfit={outfit}
                trackCursor={true}
                glow
                onEngineReady={(engine) => {
                  engineRef.current = engine;
                  // Greeting animation only — engine.greet() already plays the Coucou sound.
                  setTimeout(() => {
                    engine.greet();
                  }, 400);
                }}
              />
            </div>
          </section>

          {/* ── 2. MAIN WORKSPACE CARD (With Tabs: Overview, Chat, Diff) ── */}
          <section
            className={`w-full max-w-[480px] sm:max-w-xl bg-transparent border-0 rounded-[22px] flex flex-col mb-1 shrink-0 animate-in fade-in duration-200 ${
              tab === "chat" || tab === "opencode" ? "flex-1 min-h-0 overflow-hidden" : ""
            }`}
          >
            {/* Sub-nav Tab Headers */}
            <div className="flex items-center justify-between px-1 h-9 mb-1 bg-transparent shrink-0">
              <div className="flex items-center gap-1 bg-white/[0.06] p-0.5 rounded-[10px] border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setTab("overview")}
                  className={`flex items-center justify-center px-2.5 h-7 rounded-[8px] text-[12px] font-medium transition-all ${
                    tab === "overview"
                      ? "bg-white/15 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                  title={t("Overview")}
                >
                  <Terminal size={14} weight="bold" />
                </button>

                {chatEnabled && (
                  <button
                    type="button"
                    onClick={() => setTab("chat")}
                    className={`flex items-center gap-1.5 px-2.5 h-7 rounded-[8px] text-[12px] font-medium transition-all ${
                      tab === "chat"
                        ? "bg-white/15 text-white shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <ChatCircleDots size={14} weight="bold" />
                    <span>{t("Antigravity")}</span>
                  </button>
                )}

                {opencodeChatEnabled && (
                  <button
                    type="button"
                    onClick={() => setTab("opencode")}
                    className={`flex items-center gap-1.5 px-2.5 h-7 rounded-[8px] text-[12px] font-medium transition-all ${
                      tab === "opencode"
                        ? "bg-white/15 text-white shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                    title={t("Sesi OpenCode")}
                  >
                    <ChatCircleDots size={14} weight="bold" />
                    <span>{t("OpenCode")}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setTab("diff");
                    refreshGitDiff();
                  }}
                  className={`flex items-center gap-1.5 px-2.5 h-7 rounded-[8px] text-[12px] font-medium transition-all ${
                    tab === "diff"
                      ? "bg-white/15 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <FileCode size={14} weight="bold" />
                  <span>{t("Diff")}</span>
                </button>
              </div>

              {tab === "diff" && (
                <button
                  type="button"
                  onClick={() => refreshGitDiff()}
                  className="text-zinc-400 hover:text-zinc-200 p-1"
                  title={t("Refresh Diff")}
                >
                  <ArrowsClockwise size={14} weight="bold" />
                </button>
              )}
            </div>

            {/* Tab Body */}
            <div
              className={`flex flex-col ${
                tab === "chat" || tab === "opencode"
                  ? "flex-1 min-h-0 p-1 overflow-hidden"
                  : "p-2 min-h-[140px] justify-center"
              }`}
            >
          {tab === "overview" && (
            isFinished ? (
              /* VIEW: FINISHED / SESSION COMPLETE (Celebration view matching Notch) */
              <div className="flex flex-col gap-2.5 items-center text-center py-2 animate-in fade-in duration-200">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[12px] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                  <span>{t("Session finished")}</span>
                </div>

                <h3 className="text-[17px] font-bold text-white tracking-tight">
                  {t("Task completed")}
                </h3>

                <p className="text-[11.5px] text-zinc-400 max-w-[290px] line-clamp-2">
                  {s.lastInput ? `"${s.lastInput}"` : t("Task finished!")}
                </p>

                {/* Stepper Checklist: All Done */}
                <div className="flex items-center gap-3 text-[11px] font-medium text-emerald-400 border-t border-white/[0.05] pt-2 w-full justify-center">
                  <span className="flex items-center gap-1">
                    <Check size={11} weight="bold" /> {t("Read")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Check size={11} weight="bold" /> {t("Edit")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Check size={11} weight="bold" /> {t("Bash")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Check size={11} weight="bold" /> {t("Done")}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDisplayFinished(false);
                    agentStore.set((cur) => ({ ...cur, status: "idle" }));
                  }}
                  className="mt-1 px-7 py-2 rounded-full bg-white text-black hover:bg-zinc-200 active:scale-95 text-[12.5px] font-bold transition-all shadow-md cursor-pointer"
                >
                  OK
                </button>
              </div>
            ) : (
              /* VIEW: ACTIVE & REAL-TIME PROGRESS */
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AgyIndicator active={isWorking || isThinking} size={13} />
                    <span className="text-[13px] font-bold text-white tracking-tight">
                      {agentLabel} <span className="font-normal text-zinc-400 text-[12px]">Agent</span>
                    </span>
                  </div>

                  <div className="text-[11px] font-mono text-zinc-500">
                    {s.currentToolCategory ? `cat:${s.currentToolCategory}` : "live"}
                  </div>
                </div>

                {/* Task Snippet */}
                <div className="text-[11.5px] font-mono text-zinc-400 truncate max-w-full">
                  {s.lastInput ? `"${s.lastInput}"` : t("Waiting for task instructions...")}
                </div>

                {/* Real-time Tool & Action shimmer with glowing animation */}
                <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-zinc-100 min-h-[22px]">
                  <AgyIndicator active={isRunning} size={13} className="shrink-0" />
                  <span
                    className={`truncate max-w-[340px] font-semibold tracking-tight ${
                      isRunning ? "animate-agy-shimmer" : "text-zinc-200"
                    }`}
                  >
                    {topActionText}
                  </span>
                </div>

                {/* Dynamic Stepper Checklist (Read, Edit, Bash, Done) with live animations matching Notch */}
                <div className="flex items-center gap-3 mt-2 text-[11px] font-medium text-zinc-400 border-t border-white/[0.05] pt-2">
                  <span
                    className={`flex items-center gap-1.5 transition-colors ${
                      s.currentToolCategory === "read" && isWorking
                        ? "text-emerald-400 font-bold"
                        : s.hasRead
                        ? "text-emerald-400/90"
                        : "text-zinc-500"
                    }`}
                  >
                    {s.currentToolCategory === "read" && isWorking ? (
                      <AgyIndicator active={true} size={11} className="text-emerald-400" />
                    ) : (
                      <Check size={11} weight="bold" className={s.hasRead ? "text-emerald-400" : "opacity-35"} />
                    )}
                    <span>{t("Read")}</span>
                  </span>

                  <span
                    className={`flex items-center gap-1.5 transition-colors ${
                      s.currentToolCategory === "edit" && isWorking
                        ? "text-amber-400 font-bold"
                        : s.hasEdit
                        ? "text-amber-400/90"
                        : "text-zinc-500"
                    }`}
                  >
                    {s.currentToolCategory === "edit" && isWorking ? (
                      <AgyIndicator active={true} size={11} className="text-amber-400" />
                    ) : (
                      <Check size={11} weight="bold" className={s.hasEdit ? "text-amber-400" : "opacity-35"} />
                    )}
                    <span>{t("Edit")}</span>
                  </span>

                  <span
                    className={`flex items-center gap-1.5 transition-colors ${
                      s.currentToolCategory === "bash" && isWorking
                        ? "text-cyan-400 font-bold"
                        : s.hasBash
                        ? "text-cyan-400/90"
                        : "text-zinc-500"
                    }`}
                  >
                    {s.currentToolCategory === "bash" && isWorking ? (
                      <AgyIndicator active={true} size={11} className="text-cyan-400" />
                    ) : s.hasBash ? (
                      <Check size={11} weight="bold" className="text-cyan-400" />
                    ) : (
                      <Terminal size={11} weight="bold" className="opacity-35" />
                    )}
                    <span>{t("Bash")}</span>
                  </span>

                  <span
                    className={`flex items-center gap-1.5 transition-colors ${
                      s.hasDone || isFinished
                        ? "text-emerald-400 font-bold"
                        : "text-zinc-500"
                    }`}
                  >
                    <Check size={11} weight="bold" className={s.hasDone || isFinished ? "text-emerald-400" : "opacity-35"} />
                    <span>{t("Done")}</span>
                  </span>
                </div>

                {/* Running Command / Target File (Yellow Text) placed under Stepper */}
                {commandBoxText && (
                  <div className="mt-2.5 rounded-xl bg-black/60 border border-white/10 px-2.5 py-1.5 flex items-center shadow-inner">
                    <span className="font-mono text-[11.5px] text-amber-300 break-all line-clamp-2 select-text">
                      {commandBoxText}
                    </span>
                  </div>
                )}
                {/* Quick buttons to switch to chat tabs (Antigravity & OpenCode) */}
                {(chatEnabled || opencodeChatEnabled) && (
                  <div
                    className={`mt-2 ${
                      chatEnabled && opencodeChatEnabled ? "grid grid-cols-2 gap-2" : "flex flex-col"
                    }`}
                  >
                    {chatEnabled && (
                      <button
                        type="button"
                        onClick={() => setTab("chat")}
                        className="w-full py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] active:scale-95 border border-white/10 text-zinc-300 text-[12px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        title={t("Buka Chat Antigravity")}
                      >
                        <ChatCircleDots size={15} weight="bold" className="text-tint shrink-0" />
                        <span>{t("Antigravity")}</span>
                      </button>
                    )}
                    {opencodeChatEnabled && (
                      <button
                        type="button"
                        onClick={() => setTab("opencode")}
                        className="w-full py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] active:scale-95 border border-white/10 text-zinc-300 text-[12px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        title={t("Buka Chat OpenCode")}
                      >
                        <ChatCircleDots size={15} weight="bold" className="text-tint shrink-0" />
                        <span>{t("OpenCode")}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          )}

          {/* TAB: CHAT (Dedicated Full-Height Interactive Agent Workspace) */}
          {chatEnabled && tab === "chat" && (
            <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
              <AgentChatBox
                fillHeight={true}
                isExpanded={isChatExpanded}
                onToggleExpand={() => setIsChatExpanded((prev) => !prev)}
              />
            </div>
          )}

          {/* TAB: OPENCODE SESSION (live transcript + reply) */}
          {tab === "opencode" && (
            <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
              <OpenCodeSessionView mobile />
            </div>
          )}

          {/* TAB: DIFF */}
          {tab === "diff" && (
            <div className="max-h-[65vh] overflow-y-auto">
              <DiffView s={s} />
            </div>
          )}

          {/* TAB: WARDROBE */}
          {tab === "wardrobe" && (
            <div className="max-h-[65vh] overflow-y-auto">
              <WardrobeView onClose={() => setTab("overview")} mobile />
            </div>
          )}
        </div>
      </section>
      </>
      )}

      {/* ── 3. APPROVAL BUTTONS (Only appears when there is an approval request) ── */}
      {isApproval && (
        <footer className="w-full max-w-[480px] sm:max-w-xl grid grid-cols-3 gap-2 mb-1 shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <button
            type="button"
            onClick={handleDeny}
            className="h-11 rounded-[14px] bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 border border-white/10 text-zinc-200 text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-transform"
          >
            <span>{t("Decline")}</span>
            <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded text-zinc-400 font-mono">N</span>
          </button>

          <button
            type="button"
            onClick={handleAllow}
            className="h-11 rounded-[14px] bg-amber-500 hover:bg-amber-400 active:scale-95 text-black text-[12.5px] font-bold flex items-center justify-center gap-1.5 shadow-[0_2px_14px_rgba(245,158,11,0.45)] transition-transform"
          >
            <span>{t("Allow")}</span>
            <span className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded text-black font-mono">Y</span>
          </button>

          <button
            type="button"
            onClick={handleAlways}
            className="h-11 rounded-[14px] bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 border border-white/10 text-zinc-200 text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-transform"
          >
            <span>{t("Always")}</span>
            <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded text-zinc-400 font-mono">A</span>
          </button>
        </footer>
      )}

      {/* ── 4. APP VERSION FOOTER (Shows Windows Notch + Mobile Notch Version) ── */}
      <footer className="w-full max-w-[480px] sm:max-w-xl flex items-center justify-center gap-2 py-2 mt-auto text-[11px] text-zinc-500/80 select-none">
        <span>Notch Windows {desktopVersion ? `v${desktopVersion}` : "—"}</span>
        <span aria-hidden="true">·</span>
        <span>Notch {PLATFORM_LABEL} v{APP_VERSION}</span>
      </footer>

      {/* ── SERVER URL DIALOG ── */}
      {serverUrlOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6" onClick={() => setServerUrlOpen(false)}>
          <div
            className="w-full max-w-[380px] rounded-2xl border border-white/10 bg-zinc-900 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-[14px] font-semibold text-zinc-100">{t("Alamat IP / URL Server PC Narra-Notch:")}</h2>
            <input
              type="url"
              value={serverUrlDraft}
              onChange={(e) => setServerUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveConnection();
              }}
              placeholder="http://192.168.1.25:1421"
              className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-emerald-500/50"
              autoFocus
            />

            {serverError && (
              <p className="mt-2 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-red-400">
                {serverError}
              </p>
            )}

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setServerUrlOpen(false)}
                className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-zinc-400 hover:text-zinc-200"
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={() => void saveConnection()}
                className="rounded-lg bg-emerald-500/20 px-4 py-1.5 text-[12px] font-semibold text-emerald-400 hover:bg-emerald-500/30"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
