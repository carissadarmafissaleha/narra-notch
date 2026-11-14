import { createStore } from "../../lib/store";
import { t } from "../../i18n";
import { media } from "../../platform/media";
import { settings as appSettings } from "../../settings/store";
import { detectPlace } from "../weather/store";
import { computePrayerTimes } from "./calculator";
import { playGentlePrayerChime } from "./sound";
import type { PrayerSettings, PrayerTimesData } from "./types";

export function getInitialDefaultCity(): { name: string; lat: number; lon: number } {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.includes("Jayapura")) {
      return { name: "Sorong", lat: -0.8833, lon: 131.2598 };
    }
    if (tz.includes("Makassar")) {
      return { name: "Makassar", lat: -5.1477, lon: 119.4327 };
    }
  } catch {
    // fallback
  }
  return { name: "Jakarta", lat: -6.2088, lon: 106.8456 };
}

export function getCurrentWeatherLocation(): { name: string; lat: number; lon: number } {
  const w = appSettings.get().weather;
  if (w && Number.isFinite(w.lat) && Number.isFinite(w.lon)) {
    return { name: w.name, lat: w.lat, lon: w.lon };
  }
  return getInitialDefaultCity();
}

export const DEFAULT_PRAYER_SETTINGS: PrayerSettings = {
  gentleReminder: true,
  reminderVolume: 0.75,
  autoPauseMusic: true,
  notifyOnTime: true,
  notifyBeforeMinutes: 10,
};

export const prayerSettings = createStore<PrayerSettings>(DEFAULT_PRAYER_SETTINGS, {
  persist: "prayer_settings",
});

// Trigger location detection if weather is not yet set
if (!appSettings.get().weather) {
  void detectPlace();
}

export interface PrayerState {
  data: PrayerTimesData;
  now: Date;
  city: string;
  activeAlert: {
    prayerName: string;
    prayerTime: string;
    type: "time" | "approaching";
    message: string;
  } | null;
}

function getInitialState(): PrayerState {
  const now = new Date();
  const loc = getCurrentWeatherLocation();
  return {
    data: computePrayerTimes(now, loc.lat, loc.lon),
    now,
    city: loc.name,
    activeAlert: null,
  };
}

export const prayerStore = createStore<PrayerState>(getInitialState());

// Recompute prayer times immediately whenever weather settings change
appSettings.subscribe(() => {
  const loc = getCurrentWeatherLocation();
  const now = new Date();
  const data = computePrayerTimes(now, loc.lat, loc.lon);
  prayerStore.set((st) => ({
    ...st,
    city: loc.name,
    data,
  }));
});

let lastDismissedPrayerAt = 0;

export function isPrayerAlertBlocking(): boolean {
  return prayerStore.get().activeAlert !== null || Date.now() - lastDismissedPrayerAt < 650;
}

export function dismissPrayerAlert() {
  lastDismissedPrayerAt = Date.now();
  prayerStore.set((st) => ({ ...st, activeAlert: null }));
}

export function triggerPrayerAlert(customName?: string, customTime?: string) {
  const st = prayerStore.get();
  const pConfig = prayerSettings.get();
  const nextPrayer = st.data.next.prayer;
  const prayerName = customName ?? nextPrayer.name;
  const prayerTime = customTime ?? nextPrayer.time;

  if (pConfig.autoPauseMusic) {
    pauseMusicIfPlaying();
  }

  if (pConfig.gentleReminder) {
    playGentlePrayerChime(pConfig.reminderVolume);
  }

  if (pConfig.notifyOnTime) {
    sendPrayerNotification(
      `${t("Prayer Time")}: ${prayerName}`,
      `${prayerTime} - ${t("Time for prayer")} (${prayerName}).`
    );
  }

  prayerStore.set((curr) => ({
    ...curr,
    activeAlert: {
      prayerName,
      prayerTime,
      type: "time",
      message: `${t("Prayer Time")}: ${prayerName} (${prayerTime})`,
    },
  }));
}

export function pauseMusicIfPlaying() {
  const current = media.get();
  if (current?.isPlaying) {
    media.toggle();
  }
}

export function sendPrayerNotification(title: string, body: string) {
  try {
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(title, { body });
      } else if (Notification.permission !== "denied") {
        void Notification.requestPermission().then((p) => {
          if (p === "granted") new Notification(title, { body });
        });
      }
    }
  } catch {
    // ignore
  }
}

// Keep track of alarms triggered today so they don't fire repeatedly
const triggeredOnTime = new Set<string>();
const triggeredBefore = new Set<string>();

let lastDateDay = -1;

setInterval(() => {
  const now = new Date();
  const currentDay = now.getDate();
  if (currentDay !== lastDateDay) {
    triggeredOnTime.clear();
    triggeredBefore.clear();
    lastDateDay = currentDay;
  }

  const pConfig = prayerSettings.get();
  const loc = getCurrentWeatherLocation();
  const data = computePrayerTimes(now, loc.lat, loc.lon);
  const nowMs = now.getTime();

  // Check each prayer time
  for (const item of data.items) {
    const itemMs = item.date.getTime();
    const diffMs = itemMs - nowMs;
    const key = `${now.toISOString().slice(0, 10)}_${item.id}`;

    // 1. Right at prayer time (within 1.5 seconds)
    if (Math.abs(diffMs) <= 1500 && !triggeredOnTime.has(key)) {
      triggeredOnTime.add(key);
      triggerPrayerAlert(item.name, item.time);
    }

    // 2. Approaching reminder (e.g. 10 minutes before)
    if (pConfig.notifyBeforeMinutes > 0) {
      const beforeMs = pConfig.notifyBeforeMinutes * 60_000;
      if (diffMs > 0 && diffMs <= beforeMs && diffMs >= beforeMs - 2000 && !triggeredBefore.has(key)) {
        triggeredBefore.add(key);

        if (pConfig.notifyOnTime) {
          sendPrayerNotification(
            `${t("Upcoming Prayer")}: ${item.name}`,
            `${pConfig.notifyBeforeMinutes} min · ${item.name} (${item.time})`
          );
        }
      }
    }
  }

  prayerStore.set({
    data,
    now,
    city: loc.name,
    activeAlert: prayerStore.get().activeAlert,
  });
}, 1000);
