import { useEffect, useState, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  FileCode,
  ChatCircleDots,
  SpeakerSimpleHigh,
  SpeakerSimpleSlash,
  Check,
  Terminal,
  ArrowsClockwise,
  Bell,
  BellSlash,
  Lightning,
  Moon,
  Sun,
  GearSix,
  PlugsConnected,
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
  resolveMobileTheme,
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

  const searchParams = typeof location !== "undefined" ? new URLSearchParams(location.search) : null;
  const isShowcase = searchParams?.has("showcase") ?? false;
  const paramTab = searchParams?.get("mobileTab") || searchParams?.get("tab");
  const initialTab: MobileTab =
    paramTab === "chat" || paramTab === "antigravity"
      ? "chat"
      : paramTab === "opencode"
      ? "opencode"
      : paramTab === "diff"
      ? "diff"
      : paramTab === "wardrobe"
      ? "wardrobe"
      : "overview";

  const [tab, setTab] = useState<MobileTab>(initialTab);
  const [theme, setTheme] = useState<MobileTheme>(getMobileTheme);
  const [settingsOpen, setSettingsOpen] = useState(
    Boolean(searchParams?.has("mobileSettings") || initialTab === "wardrobe")
  );
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [desktopVersion, setDesktopVersion] = useState<string>("");
  const [isConnected, setIsConnected] = useState(isShowcase);
  // window.prompt never prefills on Capacitor Android and looks out of place → use an in-app dialog.
  const [serverUrlOpen, setServerUrlOpen] = useState(false);
  const [serverUrlDraft, setServerUrlDraft] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const engineRef = useRef<BotEngine | null>(null);

  const resolvedTheme = resolveMobileTheme(theme);
  const soundEnabled = set.codingAgent?.soundEnabled ?? true;
  const notifEnabled = set.codingAgent?.notificationsEnabled ?? true;
  const chatEnabled = set.codingAgent?.chatEnabled ?? false;
  const opencodeChatEnabled = set.codingAgent?.opencodeChatEnabled ?? false;
  const turboEnabled = !(set.codingAgent?.askPermissions ?? true);

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

  const applyAskPermissions = (askVal: unknown, turboVal?: unknown) => {
    const nextAsk =
      typeof askVal === "boolean"
        ? askVal
        : typeof turboVal === "boolean"
          ? !turboVal
          : undefined;
    if (typeof nextAsk !== "boolean") return;
    updateSettings((cur) =>
      (cur.codingAgent?.askPermissions ?? true) === nextAsk
        ? cur
        : { ...cur, codingAgent: { ...cur.codingAgent, askPermissions: nextAsk } },
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
          applyAskPermissions(d?.askPermissions, d?.turbo);
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

          // Chat visibility & Turbo Mode follow the Windows notch (init + settings://chat / settings://opencode_chat / settings://turbo).
          applyChatEnabled(msg.chatEnabled ?? msg.data?.chatEnabled);
          applyOpencodeChatEnabled(msg.opencodeChatEnabled ?? msg.data?.opencodeChatEnabled);
          if (msg.type === "settings://opencode_chat" && typeof msg.data?.opencodeChatEnabled === "boolean") {
            applyOpencodeChatEnabled(msg.data.opencodeChatEnabled);
          }
          applyAskPermissions(
            msg.askPermissions ?? msg.data?.askPermissions,
            msg.turbo ?? msg.data?.turbo,
          );
          if (msg.type === "settings://turbo") {
            applyAskPermissions(msg.data?.askPermissions, msg.data?.turbo);
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

  const selectTheme = (next: MobileTheme) => {
    setTheme(next);
    saveMobileTheme(next);
    applyMobileTheme(next);
  };

  const toggleThemeQuick = () => {
    const next: MobileTheme = resolvedTheme === "light" ? "dark" : "light";
    selectTheme(next);
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

  const toggleTurbo = () => {
    unlockMobileAudio();
    playCoucouSound("pop");
    const nextTurbo = !turboEnabled;
    const nextAsk = !nextTurbo;
    updateSettings((cur) => ({
      ...cur,
      codingAgent: {
        ...cur.codingAgent,
        askPermissions: nextAsk,
      },
    }));
    void companionFetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turbo: nextTurbo, askPermissions: nextAsk }),
    }).catch(() => {});
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

  // 1. TOP ACTION TEXT
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

  // 2. BOTTOM COMMAND BOX TEXT
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

  const diffs = s.diffs || [];
  const hasDiffs = diffs.some((d) => d.hunks.length > 0 || d.tooLarge);

  return (
    <div
      onClick={unlockMobileAudio}
      className={`ca-mob fixed inset-0 h-[100dvh] w-full flex flex-col overflow-hidden transition-colors duration-200 ${
        resolvedTheme === "dark" ? "dk" : "mobile-light"
      } ${isApproval ? "am" : ""}`}
    >
      {/* ── RADIAL HERO GLOW ── */}
      <div className="ca-gl" />

      {/* ── TOP HEADER BAR ── */}
      <header className="ca-h w-full max-w-[520px] mx-auto shrink-0">
        <div className="ca-t">
          <span className="ca-nm">
            <i>Coding</i>
            <b>Agent</b>
          </span>
          <button
            type="button"
            onClick={() => {
              setServerUrlDraft(getCompanionServerUrl() || "http://192.168.1.25:1421");
              setServerError(null);
              setServerUrlOpen(true);
            }}
            title={t("Klik untuk mengatur alamat server PC")}
            className={`ca-pl ${isConnected ? "" : "e"}`}
          >
            <i />
            <span>{isConnected ? t("Connected") : t("Disconnected")}</span>
          </button>
        </div>

        {/* Dark / Light Mode Quick Toggle Button beside Settings Gear */}
        <button
          type="button"
          onClick={toggleThemeQuick}
          className="ca-ib"
          aria-label={resolvedTheme === "light" ? t("Dunkler Modus") : t("Heller Modus")}
          title={resolvedTheme === "light" ? t("Dunkler Modus") : t("Heller Modus")}
        >
          {resolvedTheme === "light" ? (
            <Moon size={20} weight="bold" />
          ) : (
            <Sun size={20} weight="bold" />
          )}
        </button>

        {/* Settings Sheet Toggle Button */}
        <button
          type="button"
          onClick={() => setSettingsOpen((prev) => !prev)}
          className={`ca-ib ${settingsOpen ? "on" : ""}`}
          aria-label={t("Einstellungen")}
          title={t("Einstellungen")}
        >
          <GearSix size={20} weight={settingsOpen ? "fill" : "bold"} />
        </button>
      </header>

      {/* ── MOCHI MASCOT STAGE (Preserving all interactive animations & gestures) ── */}
      {!isChatExpanded && (
        <section className="ca-mo shrink-0">
          <div className="relative flex items-center justify-center">
            <MochiCanvas
              size={195}
              state={botState}
              outfit={outfit}
              trackCursor={true}
              glow={resolvedTheme === "dark"}
              onEngineReady={(engine) => {
                engineRef.current = engine;
                setTimeout(() => {
                  engine.greet();
                }, 400);
              }}
            />
          </div>
        </section>
      )}

      {/* ── ROUNDED BOTTOM SHEET (.ca-sh) ── */}
      <main className="ca-sh">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={settingsOpen ? "settings" : tab}
            initial={{ opacity: 0, y: 12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex-1 min-h-0 flex flex-col h-full"
          >
            {settingsOpen ? (
          /* ── SETTINGS SHEET VIEW (Matching 07_Settings / 14_Settings) ── */
          <div className="flex flex-col pb-4 animate-in fade-in duration-150">
            <div className="ca-rw ca-sp mb-1">
              <span className="ca-ag">
                <b>{t("Einstellungen")}</b>
              </span>
            </div>

            {/* 1. Appearance (Light / Dark / Auto) */}
            <div className="ca-sr">
              <Moon size={20} weight="bold" />
              <b>{t("Appearance")}</b>
              <div className="ca-seg">
                <button
                  type="button"
                  onClick={() => selectTheme("light")}
                  className={theme === "light" ? "on" : ""}
                >
                  {t("Light")}
                </button>
                <button
                  type="button"
                  onClick={() => selectTheme("dark")}
                  className={theme === "dark" ? "on" : ""}
                >
                  {t("Dark")}
                </button>
                <button
                  type="button"
                  onClick={() => selectTheme("auto")}
                  className={theme === "auto" ? "on" : ""}
                >
                  {t("Auto")}
                </button>
              </div>
            </div>

            {/* 2. Wardrobe / Outfit (Same as previous WardrobeView, no body color swatches) */}
            <div className="ca-sr flex-col items-stretch py-3">
              <div className="w-full">
                <WardrobeView mobile />
              </div>
            </div>

            {/* 3. Turbo Mode Switch */}
            <div className="ca-sr">
              <Lightning size={20} weight="bold" />
              <b>{t("Mode Turbo")}</b>
              <button
                type="button"
                role="switch"
                aria-checked={turboEnabled}
                aria-label={t("Mode Turbo")}
                onClick={toggleTurbo}
                className="ca-sw"
              >
                <i />
              </button>
            </div>

            {/* 4. Notifications Switch */}
            <div className="ca-sr">
              {notifEnabled ? <Bell size={20} weight="bold" /> : <BellSlash size={20} weight="bold" />}
              <b>{t("Notifications")}</b>
              <button
                type="button"
                role="switch"
                aria-checked={notifEnabled}
                aria-label={t("Notifications")}
                onClick={() => void toggleNotification()}
                className="ca-sw"
              >
                <i />
              </button>
            </div>

            {/* 5. Sound Switch */}
            <div className="ca-sr">
              {soundEnabled ? (
                <SpeakerSimpleHigh size={20} weight="bold" />
              ) : (
                <SpeakerSimpleSlash size={20} weight="bold" />
              )}
              <b>{t("Sound")}</b>
              <button
                type="button"
                role="switch"
                aria-checked={soundEnabled}
                aria-label={t("Sound")}
                onClick={toggleSound}
                className="ca-sw"
              >
                <i />
              </button>
            </div>

            {/* 6. PC Server Connection */}
            <div className="ca-sr">
              <PlugsConnected size={20} weight="bold" />
              <b>{t("Server PC")}</b>
              <button
                type="button"
                onClick={() => {
                  setServerUrlDraft(getCompanionServerUrl() || "http://192.168.1.25:1421");
                  setServerError(null);
                  setServerUrlOpen(true);
                }}
                className="ca-chip"
                style={{ height: 36, padding: "0 12px", fontSize: 12.5, background: "var(--sh)" }}
              >
                <span className="truncate max-w-[150px]">
                  {getCompanionServerUrl() || "192.168.1.25:1421"}
                </span>
              </button>
            </div>

            <div className="ca-ft">
              Notch Windows {desktopVersion ? `v${desktopVersion}` : "—"} · Notch {PLATFORM_LABEL} v{APP_VERSION}
            </div>
          </div>
        ) : tab === "overview" ? (
          isFinished ? (
            /* ── VIEW: FINISHED / SESSION COMPLETE ── */
            <div className="flex flex-col flex-1 items-center justify-center text-center py-4 animate-in fade-in duration-200">
              <span className="ca-lv mb-2 inline-flex items-center gap-1.5">
                <Check size={13} weight="bold" />
                <span>{t("Session finished")}</span>
              </span>

              <h3 className="text-[18px] font-bold tracking-tight" style={{ color: "var(--tx)" }}>
                {t("Task completed")}
              </h3>

              <p className="ca-q max-w-[300px] line-clamp-2">
                {s.lastInput ? `“${s.lastInput}”` : t("Task finished!")}
              </p>

              <div className="ca-st w-full">
                <span className="a">
                  <Check size={14} weight="bold" />
                  {t("Read")}
                </span>
                <span className="a">
                  <Check size={14} weight="bold" />
                  {t("Edit")}
                </span>
                <span className="a">
                  <Check size={14} weight="bold" />
                  {t("Bash")}
                </span>
                <span className="a">
                  <Check size={14} weight="bold" />
                  {t("Done")}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setDisplayFinished(false);
                  agentStore.set((cur) => ({ ...cur, status: "idle" }));
                }}
                className="ca-bt mt-5 max-w-[200px]"
                style={{ height: 44 }}
              >
                OK
              </button>

              <div className="ca-ft">
                Notch Windows {desktopVersion ? `v${desktopVersion}` : "—"} · Notch {PLATFORM_LABEL} v{APP_VERSION}
              </div>
            </div>
          ) : (
            /* ── VIEW: TERMINAL / OVERVIEW & PERMISSION APPROVAL (01, 02, 08, 09) ── */
            <div className="flex flex-col flex-1 animate-in fade-in duration-150">
              <div className="ca-rw ca-sp">
                <span className="ca-ag">
                  <b>{agentLabel}</b> Agent
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={toggleTurbo}
                    className="ca-lv inline-flex items-center gap-1 cursor-pointer transition-transform active:scale-95 border-0"
                    style={
                      turboEnabled
                        ? { background: "var(--amb)", color: "var(--amt)" }
                        : { background: "var(--cd)", color: "var(--mu)" }
                    }
                    title={
                      turboEnabled
                        ? t("Mode Turbo aktif: Izin disetujui otomatis")
                        : t("Aktifkan Mode Turbo (Tanpa konfirmasi izin)")
                    }
                  >
                    <Lightning size={12} weight={turboEnabled ? "fill" : "bold"} />
                    <span>{t("Turbo")}</span>
                  </button>
                  <span className="ca-lv">
                    {s.currentToolCategory ? `cat:${s.currentToolCategory}` : "live"}
                  </span>
                </div>
              </div>

              {/* Last Input Quote */}
              <p className="ca-q truncate">
                {s.lastInput ? `“${s.lastInput}”` : t("Waiting for task instructions...")}
              </p>

              {/* Current Action or Approval Warning Row */}
              {isApproval ? (
                <p className="ca-wr">
                  <span className="ca-wi">!</span>
                  <span>{t("Requires execution approval")}</span>
                </p>
              ) : (
                <p className="ca-a2">
                  <AgyIndicator active={isRunning} size={14} className="shrink-0" />
                  <span className="truncate">{topActionText}</span>
                </p>
              )}

              {/* 4-Pill Stepper (.ca-st: Read, Edit, Bash, Done) */}
              <div className="ca-st">
                <span
                  className={
                    isApproval && s.currentToolCategory === "read"
                      ? "w"
                      : s.currentToolCategory === "read" && isWorking
                      ? "a"
                      : s.hasRead
                      ? "d"
                      : ""
                  }
                >
                  <Check size={14} weight="bold" />
                  {t("Read")}
                </span>
                <span
                  className={
                    isApproval && s.currentToolCategory === "edit"
                      ? "w"
                      : s.currentToolCategory === "edit" && isWorking
                      ? "a"
                      : s.hasEdit
                      ? "d"
                      : ""
                  }
                >
                  <Check size={14} weight="bold" />
                  {t("Edit")}
                </span>
                <span
                  className={
                    isApproval && (!s.currentToolCategory || s.currentToolCategory === "bash")
                      ? "w"
                      : s.currentToolCategory === "bash" && isWorking
                      ? "a"
                      : s.hasBash
                      ? "d"
                      : ""
                  }
                >
                  <Terminal size={14} weight="bold" />
                  {t("Bash")}
                </span>
                <span className={s.hasDone || isFinished ? "a" : ""}>
                  <Check size={14} weight="bold" />
                  {t("Done")}
                </span>
              </div>

              {/* Command Preview Box (.ca-cmd or .ca-cmd.w) */}
              {commandBoxText && (
                <div className={`ca-cmd ${isApproval ? "w" : ""}`}>
                  {commandBoxText}
                </div>
              )}

              {/* Version Footer */}
              <div className="ca-ft">
                Notch Windows {desktopVersion ? `v${desktopVersion}` : "—"} · Notch {PLATFORM_LABEL} v{APP_VERSION}
              </div>
            </div>
          )
        ) : tab === "chat" && chatEnabled ? (
          /* ── VIEW: ANTIGRAVITY CHAT (03_Antigravity / 10_Antigravity) ── */
          <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
            <AgentChatBox
              mobile
              fillHeight={true}
              isExpanded={isChatExpanded}
              onToggleExpand={() => setIsChatExpanded((prev) => !prev)}
            />
          </div>
        ) : tab === "opencode" ? (
          /* ── VIEW: OPENCODE CHAT & PAIRING (04, 05, 11, 12) ── */
          <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
            <OpenCodeSessionView mobile />
          </div>
        ) : tab === "diff" ? (
          /* ── VIEW: DIFF (06_Diff / 13_Diff) ── */
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="ca-rw ca-sp mb-2 shrink-0">
              <span className="ca-ag">
                <b>{t("Diff")}</b>
              </span>
              <button
                type="button"
                onClick={() => void refreshGitDiff()}
                className="ca-ib"
                aria-label={t("Refresh Git Diff")}
                title={t("Refresh Git Diff")}
              >
                <ArrowsClockwise size={20} weight="bold" />
              </button>
            </div>

            {!hasDiffs ? (
              <div className="flex-1 flex flex-col items-center justify-center py-4 text-center">
                <div className="ca-ei" style={{ marginTop: 12 }}>
                  <FileCode size={26} weight="bold" />
                </div>
                <b className="ca-et">{t("Tidak ada perubahan file aktif")}</b>
                <p className="ca-ep">
                  {t("Diff akan muncul secara otomatis saat Coding Agent mengedit file atau ada perubahan kode di workspace.")}
                </p>
                <div className="ca-rw ca-ce" style={{ marginTop: 20 }}>
                  <button
                    type="button"
                    onClick={() => void refreshGitDiff()}
                    className="ca-chip"
                  >
                    <ArrowsClockwise size={18} weight="bold" />
                    <span>{t("Refresh Git Diff")}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <DiffView s={s} />
              </div>
            )}
          </div>
        ) : tab === "wardrobe" ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <WardrobeView onClose={() => setTab("overview")} mobile />
          </div>
        ) : null}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── BOTTOM DOCK: APPROVAL BUTTONS (When pending approval) OR FLOATING GLASS TAB BAR (.ca-tb) ── */}
      {isApproval && !settingsOpen && tab === "overview" ? (
        <div className="ca-dock animate-in fade-in slide-in-from-bottom-2 duration-200">
          <button type="button" onClick={handleDeny} className="ca-bn">
            <span>{t("Decline")}</span>
            <kbd>N</kbd>
          </button>
          <button type="button" onClick={handleAllow} className="ca-bn pr">
            <span>{t("Allow")}</span>
            <kbd>Y</kbd>
          </button>
          <button type="button" onClick={() => void handleAlways()} className="ca-bn">
            <span>{t("Always")}</span>
            <kbd>A</kbd>
          </button>
        </div>
      ) : (
        <nav className="ca-tb" aria-label="Sections">
          {/* 1. Terminal */}
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(false);
              setTab("overview");
            }}
            className={!settingsOpen && tab === "overview" ? "on" : ""}
          >
            {!settingsOpen && tab === "overview" && (
              <motion.div
                layoutId="ca-mob-tab-indicator"
                className="absolute inset-0 rounded-[27px] pointer-events-none"
                style={{ background: "var(--tbo)" }}
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
            )}
            <span className="relative z-10 flex flex-col items-center justify-center gap-0.5">
              <Terminal size={20} weight={!settingsOpen && tab === "overview" ? "bold" : "regular"} />
              <span>Terminal</span>
            </span>
          </button>

          {/* 2. Diff */}
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(false);
              setTab("diff");
              void refreshGitDiff();
            }}
            className={!settingsOpen && tab === "diff" ? "on" : ""}
          >
            {!settingsOpen && tab === "diff" && (
              <motion.div
                layoutId="ca-mob-tab-indicator"
                className="absolute inset-0 rounded-[27px] pointer-events-none"
                style={{ background: "var(--tbo)" }}
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
            )}
            <span className="relative z-10 flex flex-col items-center justify-center gap-0.5">
              <FileCode size={20} weight={!settingsOpen && tab === "diff" ? "bold" : "regular"} />
              <span>{t("Diff")}</span>
            </span>
          </button>

          {/* 3. Antigravity */}
          {chatEnabled && (
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                setTab("chat");
              }}
              className={!settingsOpen && tab === "chat" ? "on" : ""}
            >
              {!settingsOpen && tab === "chat" && (
                <motion.div
                  layoutId="ca-mob-tab-indicator"
                  className="absolute inset-0 rounded-[27px] pointer-events-none"
                  style={{ background: "var(--tbo)" }}
                  transition={{ type: "spring", stiffness: 450, damping: 35 }}
                />
              )}
              <span className="relative z-10 flex flex-col items-center justify-center gap-0.5">
                <ChatCircleDots size={20} weight={!settingsOpen && tab === "chat" ? "bold" : "regular"} />
                <span>{t("Antigravity")}</span>
              </span>
            </button>
          )}

          {opencodeChatEnabled && (
            /* 4. OpenCode */
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                setTab("opencode");
              }}
              className={!settingsOpen && tab === "opencode" ? "on" : ""}
            >
              {!settingsOpen && tab === "opencode" && (
                <motion.div
                  layoutId="ca-mob-tab-indicator"
                  className="absolute inset-0 rounded-[27px] pointer-events-none"
                  style={{ background: "var(--tbo)" }}
                  transition={{ type: "spring", stiffness: 450, damping: 35 }}
                />
              )}
              <span className="relative z-10 flex flex-col items-center justify-center gap-0.5">
                <ChatCircleDots size={20} weight={!settingsOpen && tab === "opencode" ? "bold" : "regular"} />
                <span>{t("OpenCode")}</span>
              </span>
            </button>
          )}
        </nav>
      )}

      {/* ── SERVER URL DIALOG ── */}
      {serverUrlOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
          onClick={() => setServerUrlOpen(false)}
        >
          <div
            className="w-full max-w-[380px] rounded-3xl p-5 shadow-2xl"
            style={{ background: "var(--sh)", border: "1px solid var(--ln)", color: "var(--tx)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2.5 text-[15px] font-semibold">
              {t("Alamat IP / URL Server PC Narra-Notch:")}
            </h2>
            <input
              type="url"
              value={serverUrlDraft}
              onChange={(e) => setServerUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveConnection();
              }}
              placeholder="http://192.168.1.25:1421"
              className="w-full rounded-xl px-3.5 py-2.5 text-[13.5px] outline-none"
              style={{
                background: "var(--cd)",
                border: "1px solid var(--ln)",
                color: "var(--tx)",
              }}
              autoFocus
            />

            {serverError && (
              <p
                className="mt-2.5 rounded-xl px-3 py-2 text-[11.5px] leading-relaxed"
                style={{ background: "var(--erb)", color: "var(--er)" }}
              >
                {serverError}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setServerUrlOpen(false)}
                className="ca-chip"
                style={{ height: 38 }}
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={() => void saveConnection()}
                className="ca-chip"
                style={{ height: 38, background: "var(--ac)", color: "var(--sh)" }}
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
