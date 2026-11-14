import { navigate } from "../notch/nav";
import { pinned } from "../notch/useNotchState";
import { media } from "../platform/media";
import { mockDiscord, mockPrivacy, secrets } from "../platform/services";
import { settings, updateSettings, type NotchTheme } from "../settings/store";
import { waterLog } from "../features/water/store";
import { agentStore, agentChatStore } from "../features/agent/store";
import { agentSubTabStore } from "../features/agent/AgentView";
import { lyricsSettings } from "../features/lyrics/store";
import { setCachedLyrics } from "../features/lyrics/lrclib";
import { timer } from "../features/timer/store";

/** Tools in the dock during the showcase, in this order. All 19 tools included. */
export const SHOWCASE_TOOLS = [
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
];

/**
 * Browser only (`?showcase`): English or ID UI, a curated dock, and demo states.
 * URL parameters:
 * - `tab`: target tab ("overview" | "water" | "prayer" | "media" | "settings" | "vault" | "system", etc.)
 * - `section`: target section in settings ("display" | "tools" | "agent" | "about", etc.)
 * - `theme`: "monochrome" | "color"
 * - `lang`: "en" | "id" (default: "id")
 * - `closed`: if present, renders the notch closed (pinned=false)
 * - `play`: if present, triggers media playback
 * - `bg`: "white" for pure white backdrop
 * - `lyrics`: "1" to enable synced lyrics view
 * - `agentStatus`: "idle" | "working" | "approval"
 * - `agentSubTab`: "overview" | "diff" | "wardrobe"
 */
export function startShowcase() {
  const params = new URLSearchParams(location.search);
  const targetTab = params.get("tab") || "overview";
  const targetSection = params.get("section") || null;
  const targetTheme = (params.get("theme") as NotchTheme) || "monochrome";
  const lang = (params.get("lang") as "id" | "en") || "en";
  const isEn = lang === "en";
  const isClosed = params.has("closed");

  updateSettings((s) => ({
    language: lang,
    theme: targetTheme,
    openMode: "hover",
    hoverDelay: "normal",
    tools: [
      ...SHOWCASE_TOOLS.map((id) => ({ id, enabled: true })),
      ...s.tools.filter((x) => !SHOWCASE_TOOLS.includes(x.id)).map((x) => ({ id: x.id, enabled: false })),
    ],
    trading: { env: "live" },
    weather: { name: isEn ? "New York" : "Jakarta", lat: isEn ? 40.7128 : -6.2, lon: isEn ? -74.006 : 106.8, auto: false },
    ask: { provider: "anthropic", configs: { ...s.ask.configs, anthropic: { model: "Claude 3.7 Sonnet", effort: "high", baseUrl: "" } } },
    codingAgent: {
      mochiEnabled: true,
      trackCursor: true,
      soundEnabled: true,
      soundVolume: 0.6,
      closedNotchMochi: true,
      mochiOutfit: "auto",
      chatEnabled: true,
      opencodeChatEnabled: true,
    },
  }));

  void secrets.set("t212.key", "showcase");

  // Sample realistic water log (1250 ml of 2000 ml)
  const today = new Date().toISOString().split("T")[0];
  waterLog.set({
    date: today,
    drunkMl: 1250,
    records: [
      { id: "1", timestamp: Date.now() - 10800000, ml: 500 },
      { id: "2", timestamp: Date.now() - 7200000, ml: 250 },
      { id: "3", timestamp: Date.now() - 3600000, ml: 500 },
    ],
  });

  // Sample realistic To-Dos
  try {
    localStorage.setItem(
      "todos",
      JSON.stringify(
        isEn
          ? [
              { id: "1", text: "Integrate Antigravity & OpenCode AI Agent", done: true, starred: true },
              { id: "2", text: "Test Allow / Deny approval prompts in Notch", done: true, starred: true },
              { id: "3", text: "Sync real-time karaoke lyrics via LRCLIB", done: false, starred: true },
              { id: "4", text: "Verify clean desktop companion mode", done: false, starred: false },
            ]
          : [
              { id: "1", text: "Integrasi Coding Agent Antigravity & Claude Code", done: true, starred: true },
              { id: "2", text: "Uji coba persetujuan Allow / Deny di Notch", done: true, starred: true },
              { id: "3", text: "Sinkronisasi lirik LRCLIB pada Pemutar Media", done: false, starred: true },
              { id: "4", text: "Verifikasi notch bebas jendela terminal hitam", done: false, starred: false },
            ]
      )
    );
  } catch {}

  // Sample realistic Note
  try {
    localStorage.setItem(
      "note",
      JSON.stringify(
        isEn
          ? `Narra Notch v2.2.1

Key Highlights:
- Dynamic Island notch companion for Windows 10 & 11
- Coding Agent with Mochi mascot, Diff & Approval
- OpenCode & Antigravity live session bridge
- Real-time synced lyrics & Media Player
- Hardware HUD & System Stats`
          : `Narra Notch v2.2.1

Fitur Utama:
- TopNavBar tombol mengambang di atas header
- Coding Agent hook tanpa jendela terminal hitam
- Sinkronisasi otomatis persetujuan Allow/Deny
- Lirik karaoke real-time via LRCLIB
- Pemantauan Hardware HUD & Jadwal Sholat SunArc`
      )
    );
  } catch {}

  // Seed sample English chat messages into agentChatStore
  agentChatStore.set((cur) => ({
    ...cur,
    messages: [
      {
        id: "m1",
        role: "user",
        content: "Can you help me refactor the notification system and add unit tests?",
        timestamp: Date.now() - 60000,
      },
      {
        id: "m2",
        role: "assistant",
        content: "I've refactored `notification.ts` into modular handlers and added full test coverage in `notification.test.ts`. All 12 test suites are passing!",
        timestamp: Date.now() - 30000,
        model: "gemini-2.5-flash",
      },
    ],
    availableModels: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", category: "fast" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", category: "reasoning" },
      { id: "claude-3-7-sonnet", name: "Claude 3.7 Sonnet", category: "standard" },
    ],
    selectedModel: "gemini-2.5-flash",
  }));

  // Agent store state configuration
  const agentStatus = params.get("agentStatus");
  if (agentStatus === "approval") {
    agentStore.set({
      active: true,
      status: "waiting_approval",
      isHookInstalled: true,
      pendingApproval: {
        id: "approval-1",
        toolName: "run_command",
        tool: "bash",
        command: "powershell -Command Remove-Item -Recurse ./dist",
        details: "BypassSandbox: true (run outside sandbox)",
        createdAt: Date.now(),
      },
      diffs: [
        {
          id: 1,
          path: "src/notch/Notch.tsx",
          added: 14,
          removed: 3,
          hunks: [
            {
              origStart: 15,
              newStart: 15,
              lines: [
                { kind: "added", text: "+ // TopNavBar floating above header", origLine: -1, newLine: 15 },
              ],
            },
          ],
          tooLarge: false,
          isNewFile: false,
        },
      ],
    });
  } else if (agentStatus === "working") {
    agentStore.set({
      active: true,
      status: "tool_running",
      isHookInstalled: true,
      pendingApproval: null,
      diffs: [
        {
          id: 2,
          path: "src/features/lyrics/lrclib.ts",
          added: 28,
          removed: 6,
          hunks: [
            {
              origStart: 1,
              newStart: 1,
              lines: [
                { kind: "added", text: "+ cleanTrackInfo, inflightRequests", origLine: -1, newLine: 1 },
              ],
            },
          ],
          tooLarge: false,
          isNewFile: false,
        },
      ],
    });
  } else if (targetTab === "agent") {
    agentStore.set({
      active: true,
      status: "idle",
      isHookInstalled: true,
      pendingApproval: null,
      diffs: [
        {
          id: 3,
          path: "src/features/now-playing/NowPlayingView.tsx",
          added: 3,
          removed: 18,
          hunks: [],
          tooLarge: false,
          isNewFile: false,
        },
        {
          id: 4,
          path: "src-tauri/src/agent.rs",
          added: 15,
          removed: 2,
          hunks: [],
          tooLarge: false,
          isNewFile: false,
        },
      ],
    });
  }

  // Agent sub-tab
  const agentSubTab = params.get("agentSubTab");
  if (agentSubTab === "diff" || agentSubTab === "wardrobe" || agentSubTab === "overview") {
    agentSubTabStore.set({ tab: agentSubTab });
  }

  // Lyrics setup
  const withLyrics = params.get("lyrics") === "1" || (targetTab === "media" && params.get("lyrics") !== "0");
  lyricsSettings.set({ enabled: withLyrics, showInPill: true });
  setCachedLyrics("Midnight City", "M83", {
    id: "midnight-city",
    trackName: "Midnight City",
    artistName: "M83",
    synced: [
      { time: 55, text: "Waiting in a car" },
      { time: 62, text: "Waiting for a ride in the dark" },
      { time: 69, text: "The night city grows" },
      { time: 76, text: "Look and see her eyes, they glow" },
      { time: 83, text: "Waiting in a car" },
      { time: 90, text: "Waiting for a ride in the dark" },
    ],
    plain: null,
  });

  // Timer setup
  if (targetTab === "timer") {
    timer.set({
      mode: "focus",
      duration: 25 * 60,
      endsAt: Date.now() + (18 * 60 + 24) * 1000,
      remaining: 18 * 60 + 24,
      finished: false,
    });
  }

  navigate(targetTab, targetSection);
  pinned.set(!isClosed);

  if ((params.has("play") || targetTab === "media") && !media.get()?.isPlaying) {
    media.toggle();
  }

  Object.assign(window, {
    __showcase: {
      play: () => !media.get()?.isPlaying && media.toggle(),
      pause: () => media.get()?.isPlaying && media.toggle(),
      call: (on: boolean) => {
        mockPrivacy.mic = on;
        if (on !== !!mockDiscord.get().call) mockDiscord.toggleCall();
      },
      navigate,
      pinned,
      settings,
    },
  });
}
