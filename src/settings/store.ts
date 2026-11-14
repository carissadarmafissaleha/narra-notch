import { invoke } from "@tauri-apps/api/core";
import { createStore } from "../lib/store";
import type { AlarmDuration, AlarmSound } from "../lib/sound";
import { isNative, onModeFromTray, syncModeTray } from "../platform/native";

export type AskProvider = "openrouter" | "openai" | "anthropic" | "custom";
export type AskEffort = "low" | "medium" | "high" | "xhigh";
/** "monochrome" = pure black + white; "color" = same black notch, accents in a chosen color. */
export type NotchTheme = "monochrome" | "color";
export type ThemeColor = "blue" | "violet" | "pink" | "red" | "orange" | "yellow" | "green" | "teal";

export interface AskProviderConfig {
  model: string;
  effort: AskEffort;
  /** Only for "custom": OpenAI-compatible base, e.g. https://…/v1 */
  baseUrl: string;
}

export interface Settings {
  theme: NotchTheme;
  /** Accent color for the "color" theme. */
  themeColor: ThemeColor;
  /** Open on hover or only on click. */
  openMode: "hover" | "click";
  hoverDelay: "fast" | "normal" | "patient";
  /** Order = order in the tool bar. */
  tools: { id: string; enabled: boolean }[];
  trading: { env: "live" | "demo" };
  /** AI usage: which providers are shown (order = display order). */
  usage: { claude: boolean; codex: boolean; gemini: boolean; cursor: boolean };
  ask: { provider: AskProvider; configs: Record<AskProvider, AskProviderConfig> };
  /** `auto` = detected via IP (again on every start); a picked location stays. */
  weather: { name: string; lat: number; lon: number; auto?: boolean } | null;
  /**
   * Display: always on top or hidden in fullscreen; monitor name (null = primary);
   * `offset` = horizontal offset from the center in CSS px (set by dragging).
   */
  display: {
    visibility: "always" | "hide-fullscreen";
    monitor: string | null;
    offset: number;
    /** Focus mode look: half transparent (as before) or shrunk to a thin line at the edge. */
    focusStyle: "dim" | "line";
    /**
     * Closed look outside focus mode: the notch, or a thin line (no music etc.; only a
     * finished timer opens it into the notch until dismissed). Hover and click work as usual.
     */
    idleStyle: "notch" | "line";
    /** Scaling of open notch (0.8 = 80%, 1.0 = 100%, 1.2 = 120%). */
    scale?: 0.8 | 1 | 1.2;
  };
  /** Gaming mode: FPS + load in the closed notch: off, only in fullscreen, or always. */
  gaming: { mode: "off" | "fullscreen" | "on" };
  /** Dots like on iPhone: mic/camera (green) or screen recording (red) in use. */
  privacyDots: boolean;
  /** Discord call in the notch (local RPC, on = Discord tool enabled). The client secret is stored with the secrets. */
  discord: { clientId: string };
  alarm: { sound: AlarmSound; volume: number; duration: AlarmDuration };
  language: "id" | "en";
  /** Temperature and clock format; picked from the Windows region on first start. */
  units: { temp: "c" | "f"; clock: "24" | "12" };
  /**
   * Presentation mode: hides clipboard previews, balances and the vault while sharing
   * the screen. `manual` = switched on by hand, `auto` = on while a recording is detected.
   */
  presentation: { manual: boolean; auto: boolean };
  /** Check for a new version once a day, anonymously (installs only on click). */
  updates: { auto: boolean };
  mochi?: { enabled: boolean; trackCursor: boolean };
  codingAgent: {
    mochiEnabled: boolean;
    trackCursor: boolean;
    soundEnabled: boolean;
    soundVolume: number;
    closedNotchMochi: boolean;
    mochiOutfit: string;
    notificationsEnabled?: boolean;
    /** Show the Chat tab in the notch and in the iPhone/PWA companion (default off). */
    chatEnabled?: boolean;
    /** Show the OpenCode Chat tab in the notch and in the iPhone/PWA companion (default off). */
    opencodeChatEnabled?: boolean;
    /**
     * Ask before shell commands and file edits in OpenCode (default on). The
     * plugin injects session-scoped `ask` rules, so no opencode.json editing.
     */
    askPermissions?: boolean;
  };
}

declare global {
  interface Window {
    /** Settings JSON injected by Rust before the bundle runs (survives a wiped WebView profile). */
    __NOTCH_SETTINGS__?: Partial<Settings> & { gradientPreset?: string };
    /** File timestamp (ms) of the injected settings copy. */
    __NOTCH_SETTINGS_SAVED_AT__?: number;
  }
}

/** All tool IDs in default order. Must match `src/notch/tabs.ts`. */
export const TOOL_IDS = [
  "overview",
  "prayer",
  "water",
  "whatsapp",
  "agent",
  "media",
  "timer",
  "todos",
  "notes",
  "clipboard",
  "shelf",
  "ask",
  "convert",
  "trading",
  "usage",
  "weather",
  "system",
  "discord",
  "vault",
] as const;

const DEFAULT_OFF = new Set<string>(["prayer", "whatsapp", "system", "discord", "trading", "vault"]);

const defaults: Settings = {
  theme: "monochrome",
  themeColor: "blue",
  openMode: "hover",
  hoverDelay: "normal",
  tools: TOOL_IDS.map((id) => ({ id, enabled: !DEFAULT_OFF.has(id) })),
  trading: { env: "live" },
  usage: { claude: true, codex: true, gemini: true, cursor: false },
  ask: {
    provider: "custom",
    configs: {
      openrouter: { model: "", effort: "medium", baseUrl: "" },
      openai: { model: "", effort: "medium", baseUrl: "" },
      anthropic: { model: "claude-opus-5-5", effort: "medium", baseUrl: "" },
      custom: { model: "", effort: "medium", baseUrl: "" },
    },
  },
  weather: null,
  display: { visibility: "always", monitor: null, offset: 0, focusStyle: "dim", idleStyle: "notch", scale: 1 },
  gaming: { mode: "off" },
  privacyDots: false,
  discord: { clientId: "" },
  alarm: { sound: "chime", volume: 0.7, duration: 5 },
  language: "id",
  units: regionUnits(),
  presentation: { manual: false, auto: true },
  updates: { auto: true },
  mochi: { enabled: true, trackCursor: true },
  codingAgent: {
    mochiEnabled: true,
    trackCursor: true,
    soundEnabled: true,
    soundVolume: 0.6,
    closedNotchMochi: true,
    mochiOutfit: "auto",
    notificationsEnabled: true,
    chatEnabled: false,
    opencodeChatEnabled: false,
    askPermissions: true,
  },
};

/** °F and 12 h where the Windows region uses them (US & co.), otherwise °C and 24 h. */
function regionUnits(): Settings["units"] {
  const loc = navigator.language || "en-US";
  let region = "";
  let cycle: string | undefined;
  try {
    region = new Intl.Locale(loc).maximize().region ?? "";
    cycle = new Intl.DateTimeFormat(loc, { hour: "numeric" }).resolvedOptions().hourCycle;
  } catch {
    // Unknown locale → metric, 24 h.
  }
  return {
    temp: ["US", "LR", "MM", "BS", "BZ", "KY", "PW", "FM", "MH"].includes(region) ? "f" : "c",
    clock: cycle === "h12" || cycle === "h11" ? "12" : "24",
  };
}

export const hoverDelayMs: Record<Settings["hoverDelay"], number> = { fast: 90, normal: 220, patient: 480 };

/** Was a cache entry present before the store wrote its defaults? */
const hadLocalSettings = (() => {
  try {
    return localStorage.getItem("notch:settings") !== null;
  } catch {
    return false;
  }
})();

/** No settings saved yet = fresh install (read before the store writes its defaults). */
export const firstRun = (() => {
  // A JSON copy injected by Rust means this is an existing install even when
  // WebView2's localStorage was wiped by an installer/update.
  return !hadLocalSettings && !window.__NOTCH_SETTINGS__;
})();

export const settings = createStore<Settings>(defaults, { persist: "settings" });

/** Fill in settings from older versions: new fields + append new tools. */
function normalizeSettings(input: Partial<Settings> & { gradientPreset?: string }): Settings {
  const s = input;
  const known = new Set<string>(TOOL_IDS);
  const tools = (s.tools ?? []).filter((t) => known.has(t.id));
  for (const id of TOOL_IDS) {
    if (tools.some((t) => t.id === id)) continue;
    // Overview is the start page, so put it first for existing installs.
    if (id === "overview") tools.unshift({ id, enabled: true });
    else tools.push({ id, enabled: !DEFAULT_OFF.has(id) });
  }
  return {
    ...defaults,
    ...s,
    tools,
    trading: { ...defaults.trading, ...s.trading },
    usage: { ...defaults.usage, ...s.usage },
    display: { ...defaults.display, ...s.display },
    gaming: { ...defaults.gaming, ...s.gaming },
    discord: { ...defaults.discord, ...s.discord },
    alarm: { ...defaults.alarm, ...s.alarm },
    units: { ...defaults.units, ...s.units },
    presentation: { ...defaults.presentation, ...s.presentation },
    updates: { ...defaults.updates, ...s.updates },
    codingAgent: { ...defaults.codingAgent, ...s.codingAgent },
    language: (s.language as string) === "de" ? "id" : (s.language ?? "id"),
    ask: migrateAsk(s.ask),
    ...migrateTheme(s),
  };
}

settings.set((s) => normalizeSettings(s));

/*
 * Durable settings file.
 *
 * WebView2 keeps localStorage in its profile folder. Some installs/updates
 * replace that profile (or the user runs a repair that clears it), which made
 * every setting fall back to defaults. Rust therefore mirrors the same JSON to
 * `%APPDATA%\app.narra-notch.windows\settings.json` (plus a `.bak`) and injects
 * it into the page before the bundle runs.
 */
const SETTINGS_TIMESTAMP_KEY = "notch:settings-file-saved-at";

// The init script (see src-tauri/src/lib.rs) seeded this synchronously. Prefer
// it over a stale cache, but never over a newer localStorage change.
const seededSettings = window.__NOTCH_SETTINGS__;
if (seededSettings) {
  const fileSavedAt = window.__NOTCH_SETTINGS_SAVED_AT__ ?? 0;
  let localSavedAt = 0;
  try {
    localSavedAt = Number(localStorage.getItem(SETTINGS_TIMESTAMP_KEY) ?? 0);
  } catch {}
  if (!hadLocalSettings || fileSavedAt >= localSavedAt) {
    settings.set(normalizeSettings(seededSettings));
  }
}

let persistenceStarted = false;

/** Loads the JSON copy (when the init script could not) and starts mirroring. */
export async function initSettingsPersistence() {
  if (!isNative || persistenceStarted) return;
  persistenceStarted = true;

  if (!seededSettings) {
    try {
      const raw = await invoke<string | null>("settings_load");
      if (raw) {
        settings.set(normalizeSettings(JSON.parse(raw) as Partial<Settings>));
      } else {
        await saveSettingsToDisk();
      }
    } catch {
      // No file yet (or a broken one): localStorage remains the source.
    }
  } else {
    // Make sure both copies agree after a profile wipe.
    await saveSettingsToDisk();
  }

  let timer: number | null = null;
  const flush = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    void saveSettingsToDisk();
  };
  settings.subscribe(() => {
    // Mark the cache as newer than the file right away, so a quit inside the
    // debounce window restores the newest value instead of the older file.
    try {
      localStorage.setItem(SETTINGS_TIMESTAMP_KEY, String(Date.now()));
    } catch {}
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      void saveSettingsToDisk();
    }, 400);
  });
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

async function saveSettingsToDisk() {
  if (!isNative) return;
  try {
    await invoke("settings_save", { content: JSON.stringify(settings.get()) });
    localStorage.setItem(SETTINGS_TIMESTAMP_KEY, String(Date.now()));
  } catch {
    // Keep localStorage as the fallback; a disk error must never block the UI.
  }
}

/** Old "glass"/"gradient" themes are gone: glass → monochrome, gradient → color (closest hue). */
function migrateTheme(s: Partial<Settings> & { gradientPreset?: string }): Pick<Settings, "theme" | "themeColor"> {
  const fromPreset: Record<string, ThemeColor> = { aurora: "violet", sunset: "pink", ocean: "teal", emerald: "green" };
  const theme = s.theme as string | undefined;
  const known: ThemeColor[] = ["blue", "violet", "pink", "red", "orange", "yellow", "green", "teal"];
  const themeColor = s.themeColor && known.includes(s.themeColor) ? s.themeColor : (fromPreset[s.gradientPreset ?? ""] ?? defaults.themeColor);
  if (theme === "gradient") return { theme: "color", themeColor: fromPreset[s.gradientPreset ?? ""] ?? themeColor };
  if (theme === "color") return { theme: "color", themeColor };
  return { theme: "monochrome", themeColor };
}

/** Migrates the old shape ({ provider: "demo", model }) and adds missing providers. */
function migrateAsk(old: Partial<Settings["ask"]> | undefined): Settings["ask"] {
  const known = Object.keys(defaults.ask.configs) as AskProvider[];
  const provider = old?.provider && known.includes(old.provider) ? old.provider : defaults.ask.provider;
  const configs = { ...defaults.ask.configs };
  for (const p of known) configs[p] = { ...defaults.ask.configs[p], ...old?.configs?.[p] };
  return { provider, configs };
}

export function updateAsk(provider: AskProvider, patch: Partial<AskProviderConfig>) {
  settings.set((s) => ({ ...s, ask: { ...s.ask, configs: { ...s.ask.configs, [provider]: { ...s.ask.configs[provider], ...patch } } } }));
}

export function updateSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  settings.set((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));
}

// Sync notch mode (normal / line) with the system tray
let lastSyncedMode: "notch" | "line" | null = null;
const syncTrayWithMode = () => {
  const currentMode = settings.get().display.idleStyle;
  if (currentMode !== lastSyncedMode) {
    lastSyncedMode = currentMode;
    syncModeTray(currentMode);
  }
};
syncTrayWithMode();
settings.subscribe(syncTrayWithMode);
onModeFromTray((mode) => {
  updateSettings((cur) => ({ display: { ...cur.display, idleStyle: mode } }));
});
