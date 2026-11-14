import { Component, StrictMode, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import "./styles/global.css";
import { Notch } from "./notch/Notch";
import { MobileAgentCompanion } from "./features/agent/MobileAgentCompanion";
import { DesktopMock } from "./dev/DesktopMock";
import { isNative } from "./platform/native";
import { startDropListener } from "./platform/drop";
import { clipboard } from "./platform/clipboard";
import { settings, updateSettings, initSettingsPersistence } from "./settings/store";
import { applyDisplay } from "./notch/drag";
import { startFocusMode } from "./notch/focus";
import { startSystemPolling } from "./features/system/store";
import { startGamingWatch } from "./features/system/gaming";
import { startDiscord } from "./features/discord/store";
import { startUpdateWatch } from "./lib/update";
import { showcase } from "./dev/showcase-data";
import { startShowcase } from "./dev/showcase";
import { applyMobileTheme, getMobileTheme } from "./lib/mobileTheme";

if (showcase) startShowcase();

// Restore the settings file before React renders. localStorage is only the
// fast cache; the JSON copy in %APPDATA% survives installer/update profiles.
void initSettingsPersistence();

startDropListener();
startFocusMode();
startSystemPolling();
startGamingWatch();
startDiscord();
startUpdateWatch();

// Send display settings (monitor, fullscreen, offset, gaming) to Rust on start and on every change.
let lastDisplay = "";
const syncDisplay = () => {
  const { display, gaming } = settings.get();
  const key = `${display.visibility}|${display.monitor}|${display.offset}|${gaming.mode}`;
  if (key === lastDisplay) return;
  lastDisplay = key;
  applyDisplay();
};
syncDisplay();
settings.subscribe(syncDisplay);

// Automatically reset offset and center notch when monitor/resolution changes in Windows
if (isNative) {
  void listen("notch://display-changed", () => {
    updateSettings((cur) => ({
      display: { ...cur.display, offset: 0 },
    }));
  });
}

// Clipboard history only records what an enabled tool uses (Ask: the latest text).
let lastClipMode = "";
const syncClipboardMode = () => {
  const on = (id: string) => settings.get().tools.some((t) => t.id === id && t.enabled);
  const mode = on("clipboard") ? "all" : on("ask") ? "text" : "off";
  if (mode === lastClipMode) return;
  lastClipMode = mode;
  clipboard.mode(mode);
};
syncClipboardMode();
settings.subscribe(syncClipboardMode);

// Language: update the tray menu in Rust and set the lang attribute.
let lastLang = "";
const applyLanguage = () => {
  const { language } = settings.get();
  if (language === lastLang) return;
  lastLang = language;
  document.documentElement.lang = language;
  if (isNative) void invoke("set_language", { lang: language });
};
applyLanguage();
settings.subscribe(applyLanguage);

// Coding agent chat visibility: the Windows notch owns the switch; mirror it to the
// companion server so the iPhone/PWA hides the chat tab too.
let lastChatEnabled: boolean | null = null;
const syncCompanionChat = () => {
  const on = settings.get().codingAgent?.chatEnabled ?? false;
  if (on === lastChatEnabled) return;
  lastChatEnabled = on;
  if (isNative) void invoke("set_companion_chat", { enabled: on });
};
syncCompanionChat();
settings.subscribe(syncCompanionChat);

let lastOpencodeChatEnabled: boolean | null = null;
const syncCompanionOpencodeChat = () => {
  const on = settings.get().codingAgent?.opencodeChatEnabled ?? false;
  if (on === lastOpencodeChatEnabled) return;
  lastOpencodeChatEnabled = on;
  if (isNative) void invoke("set_companion_opencode_chat", { enabled: on });
};
syncCompanionOpencodeChat();
settings.subscribe(syncCompanionOpencodeChat);

// Mochi outfit: the phone/PWA keeps its own copy, but the desktop is the source
// of truth. Push it on start and on every change, otherwise a desktop restart
// leaves the companion on its default and the chosen outfit seems to vanish.
let lastOutfit = "";
const syncCompanionOutfit = () => {
  const outfit = settings.get().codingAgent?.mochiOutfit ?? "auto";
  if (outfit === lastOutfit) return;
  lastOutfit = outfit;
  if (isNative) void invoke("set_companion_outfit", { outfit });
};
syncCompanionOutfit();
settings.subscribe(syncCompanionOutfit);

// Outfit picked on the phone: adopt it into the desktop settings, otherwise the
// next desktop start would push the old outfit back to the companion.
if (isNative) {
  void listen<{ outfit?: string }>("settings://companion_outfit", (event) => {
    const outfit = event.payload?.outfit;
    if (!outfit) return;
    updateSettings((cur) =>
      cur.codingAgent?.mochiOutfit === outfit
        ? cur
        : { ...cur, codingAgent: { ...cur.codingAgent, mochiOutfit: outfit } },
    );
  });

  void listen<{ turbo?: boolean; askPermissions?: boolean }>("settings://companion_turbo", (event) => {
    const ask =
      typeof event.payload?.askPermissions === "boolean"
        ? event.payload.askPermissions
        : typeof event.payload?.turbo === "boolean"
          ? !event.payload.turbo
          : undefined;
    if (typeof ask !== "boolean") return;
    updateSettings((cur) =>
      (cur.codingAgent?.askPermissions ?? true) === ask
        ? cur
        : { ...cur, codingAgent: { ...cur.codingAgent, askPermissions: ask } },
    );
  });
}

// OpenCode approvals: the plugin injects session `ask` rules only while this is
// on, and only while the notch's agent tool can actually show the prompt.
let lastAskPermissions: boolean | null = null;
const syncAskPermissions = () => {
  const s = settings.get();
  const agentTool = s.tools.find((tool) => tool.id === "agent")?.enabled !== false;
  const on = (s.codingAgent?.askPermissions ?? true) && agentTool;
  if (on === lastAskPermissions) return;
  lastAskPermissions = on;
  if (isNative) void invoke("agent_set_ask_permissions", { enabled: on });
};
syncAskPermissions();
settings.subscribe(syncAskPermissions);

// The notch isn't a web page: no browser context menu (except in text fields for
// cut/paste) and in the app no browser shortcuts like reload or print.
window.addEventListener("contextmenu", (e) => {
  if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
});
if (isNative) {
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (e.key === "F5" || e.key === "F7" || e.key === "F12" || (e.ctrlKey && ["r", "p", "f", "g", "j", "u", "s"].includes(k))) e.preventDefault();
  });
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any, info: any) {
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center p-4 text-white font-sans">
          <div className="rounded-[16px] bg-black/80 backdrop-blur-xl border border-white/10 p-5 text-center max-w-sm">
            <h3 className="text-[14px] font-bold mb-1">Terjadi Kesalahan</h3>
            <p className="text-[12px] text-zinc-400 mb-3">Notch mendeteksi kendala pada tampilan.</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="px-3.5 py-1.5 rounded-full bg-white text-black text-[12px] font-semibold hover:bg-zinc-200"
            >
              Pulihkan Notch
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Mobile companion (iPhone/PWA) only exists in the browser. The Windows app always
 * renders the notch, even when its window is narrower than 768 px (high-DPI monitors
 * shrink the CSS viewport, which used to flip the desktop app into the PWA layout).
 */
export const isMobile =
  !isNative &&
  typeof window !== "undefined" &&
  (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    window.innerWidth <= 768 ||
    new URLSearchParams(window.location.search).has("mobile"));

if (isMobile) {
  applyMobileTheme(getMobileTheme());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {/* reducedMotion="user": Motion respects the Windows "Animation effects" setting. */}
      <MotionConfig reducedMotion="user">
        {isMobile ? (
          <MobileAgentCompanion />
        ) : (
          <>
            {!isNative && <DesktopMock />}
            <Notch />
          </>
        )}
      </MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
);
