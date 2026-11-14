import { createStore } from "../../lib/store";
import { t } from "../../i18n";
import { isNative } from "../../platform/native";
import { listen } from "@tauri-apps/api/event";
import { isWaterAlertBlocking } from "../water/store";
import { isPrayerAlertBlocking } from "../prayer/store";
import type { HudPayload, HudState } from "./types";

const INITIAL_STATE: HudState = {
  active: false,
  type: "volume",
  title: "Volume",
  value: 50,
  label: "50%",
};

export const hudStore = createStore<HudState>(INITIAL_STATE);

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function showHud(payload: HudPayload, durationMs = 2200) {
  if (isWaterAlertBlocking() || isPrayerAlertBlocking()) return;
  if (hideTimer) clearTimeout(hideTimer);
  hudStore.set({
    active: true,
    ...payload,
  });

  hideTimer = setTimeout(() => {
    hudStore.set((s) => ({ ...s, active: false }));
  }, durationMs);
}

export function dismissHud() {
  if (hideTimer) clearTimeout(hideTimer);
  hudStore.set((s) => ({ ...s, active: false }));
}

export function useHudLive(): boolean {
  return hudStore.use().active;
}

// Quick trigger helpers for each HUD type
export function triggerVolumeHud(levelPercent: number, muted = false) {
  const val = Math.max(0, Math.min(100, Math.round(levelPercent)));
  showHud({
    type: "volume",
    title: t("Volume"),
    value: muted ? 0 : val,
    label: muted ? t("Muted") : `${val}%`,
  });
}

export function triggerBrightnessHud(levelPercent: number) {
  const val = Math.max(0, Math.min(100, Math.round(levelPercent)));
  showHud({
    type: "brightness",
    title: t("Brightness"),
    value: val,
    label: `${val}%`,
  });
}

export function triggerCapsLockHud(isOn: boolean) {
  showHud({
    type: "capslock",
    title: t("Caps Lock"),
    label: isOn ? t("Active") : t("Inactive"),
  });
}

export function triggerLanguageHud(langName?: string) {
  const name = langName ?? (currentInputLang === "ENG" ? "IDN" : "ENG");
  currentInputLang = name;
  showHud({
    type: "language",
    title: t("Input Language"),
    label: name,
  });
}

export function triggerBatteryHud(levelPercent: number, charging = false) {
  const val = Math.max(0, Math.min(100, Math.round(levelPercent)));
  showHud({
    type: "battery",
    title: t("Battery"),
    value: val,
    label: `${val}%`,
    sublabel: charging ? t("Charging") : t("Discharging"),
  });
}

export function triggerWifiHud(connected = true, ssid = "Wi-Fi Network") {
  showHud({
    type: "wifi",
    title: t("Wi-Fi"),
    label: connected ? t("Connected") : t("Disconnected"),
    sublabel: connected ? ssid : undefined,
  });
}

export function triggerBluetoothHud(connected = true, device = "Device") {
  showHud({
    type: "bluetooth",
    title: t("Bluetooth"),
    label: connected ? t("Connected") : t("Inactive"),
    sublabel: connected ? device : undefined,
  });
}

let currentInputLang = "ENG";

// Initialize global hardware and browser listeners
let listenersInitialized = false;
export function initHudListeners() {
  if (listenersInitialized || typeof window === "undefined") return;
  listenersInitialized = true;

  // 1. Native Windows Hardware Listeners (Tauri backend)
  if (isNative) {
    // Real-time system volume changes (keyboard keys, slider, mouse wheel)
    void listen<{ level: number; muted: boolean }>("hud://volume", (e) => {
      triggerVolumeHud(e.payload.level * 100, e.payload.muted);
    });

    // Global CapsLock toggle detection across any application
    void listen<{ active: boolean }>("hud://capslock", (e) => {
      triggerCapsLockHud(e.payload.active);
    });

    // Laptop battery charging state and low-battery events
    void listen<{ level: number; charging: boolean }>("hud://battery", (e) => {
      triggerBatteryHud(e.payload.level, e.payload.charging);
    });
  }

  // 2. CapsLock Keydown detection (browser fallback)
  window.addEventListener("keydown", (e) => {
    if (e.key === "CapsLock") {
      // Small timeout so modifier state updates
      setTimeout(() => {
        const capsOn = e.getModifierState("CapsLock");
        triggerCapsLockHud(capsOn);
      }, 20);
    }

    // Input language switch: Alt+Shift or Win+Space
    if (e.altKey && e.shiftKey) {
      triggerLanguageHud();
    }
  });

  // 2. Battery status detection
  try {
    const nav = navigator as unknown as {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener: (event: string, handler: () => void) => void;
      }>;
    };
    if (typeof nav.getBattery === "function") {
      void nav.getBattery().then((battery) => {
        const onBatChange = () => {
          triggerBatteryHud(battery.level * 100, battery.charging);
        };
        // Only alert when charger is plugged in or unplugged
        battery.addEventListener("chargingchange", onBatChange);
      });
    }
  } catch {
    // Battery API unavailable
  }

  // 3. Online/Offline network detection
  window.addEventListener("online", () => {
    triggerWifiHud(true, "Online");
  });
  window.addEventListener("offline", () => {
    triggerWifiHud(false);
  });
}

// Auto initialize on import
initHudListeners();
