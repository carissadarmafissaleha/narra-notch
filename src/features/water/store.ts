import { createStore } from "../../lib/store";
import { t } from "../../i18n";
import { playGentleWaterChime } from "./sound";
import type { WaterLog, WaterSettings, WaterSummary } from "./types";

export const DEFAULT_WATER_SETTINGS: WaterSettings = {
  bottleSizeMl: 500,
  dailyGoalL: 1.5,
  startHour: 8,
  endHour: 17,
  reminderIntervalMinutes: 15,
  notificationsEnabled: true,
  soundEnabled: true,
  reminderVolume: 0.7,
  drinkStepMl: 250,
};

function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DEFAULT_WATER_LOG: WaterLog = {
  date: getTodayDateString(),
  drunkMl: 0,
  records: [],
};

export const waterSettings = createStore<WaterSettings>(DEFAULT_WATER_SETTINGS, {
  persist: "water_settings",
});

export const waterLog = createStore<WaterLog>(DEFAULT_WATER_LOG, {
  persist: "water_log",
});

export interface WaterLiveAlert {
  active: boolean;
  message: string;
}

export const waterAlertStore = createStore<WaterLiveAlert>({
  active: false,
  message: "",
});

export function useWaterAlert(): boolean {
  const alert = waterAlertStore.use();
  return alert.active;
}

export function sendWaterNotification(title: string, body: string) {
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

let autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

export function triggerWaterAlert(message?: string) {
  const s = waterSettings.get();
  const alertMsg = message ?? t("Stay hydrated!");

  if (autoDismissTimer) {
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  }

  waterAlertStore.set({
    active: true,
    message: alertMsg,
  });

  if (s.soundEnabled) {
    playGentleWaterChime(s.reminderVolume);
  }

  if (s.notificationsEnabled) {
    sendWaterNotification(t("Time to Drink"), alertMsg);
  }

  // Auto-dismiss after 25s if user is away/idle so notch doesn't stay permanently locked
  autoDismissTimer = setTimeout(() => {
    if (waterAlertStore.get().active) {
      dismissWaterAlert();
    }
  }, 25000);
}

let lastDismissedWaterAt = 0;

export function isWaterAlertBlocking(): boolean {
  return waterAlertStore.get().active || Date.now() - lastDismissedWaterAt < 650;
}

export function dismissWaterAlert() {
  if (autoDismissTimer) {
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  }
  lastDismissedWaterAt = Date.now();
  waterAlertStore.set({ active: false, message: "" });
}

let snoozeTimer: ReturnType<typeof setTimeout> | null = null;

export function snoozeWater(minutes = 5) {
  dismissWaterAlert();
  if (snoozeTimer) clearTimeout(snoozeTimer);
  snoozeTimer = setTimeout(() => {
    triggerWaterAlert();
  }, minutes * 60 * 1000);
}

export function drankWaterFromBanner() {
  const s = waterSettings.get();
  const summary = calculateWaterSummary(s, waterLog.get(), new Date());
  // Log sip portion (e.g. 42 ml or drinkStepMl)
  drinkWater(summary.sipMl);
  dismissWaterAlert();
}

export function drinkWater(amountMl?: number) {
  const s = waterSettings.get();
  const mlToAdd = amountMl ?? s.drinkStepMl;
  const today = getTodayDateString();

  waterLog.set((log) => {
    const isNewDay = log.date !== today;
    const currentDrunk = isNewDay ? 0 : log.drunkMl;
    const currentRecords = isNewDay ? [] : log.records;

    return {
      date: today,
      drunkMl: Math.max(0, currentDrunk + mlToAdd),
      records: [
        ...currentRecords,
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: Date.now(),
          ml: mlToAdd,
        },
      ],
    };
  });

  if (s.soundEnabled) {
    playGentleWaterChime(s.reminderVolume);
  }
}

export function resetTodayWater() {
  const today = getTodayDateString();
  waterLog.set({
    date: today,
    drunkMl: 0,
    records: [],
  });
  triggeredSlots.clear();
}

export function resetWaterSettings() {
  waterSettings.set(DEFAULT_WATER_SETTINGS);
}

export function resetAllWater() {
  resetTodayWater();
  resetWaterSettings();
}

export function calculateWaterSummary(
  settings: WaterSettings,
  log: WaterLog,
  now = new Date()
): WaterSummary {
  const goalMl = Math.round(settings.dailyGoalL * 1000);
  const today = getTodayDateString();
  const drunkMl = log.date === today ? log.drunkMl : 0;
  const progressPercent = goalMl > 0 ? Math.min(100, Math.round((drunkMl / goalMl) * 100)) : 0;

  // Active hours duration in hours
  let activeHours = settings.endHour - settings.startHour;
  if (activeHours <= 0) activeHours += 24;
  const totalActiveMinutes = activeHours * 60;

  // Reminders count
  const interval = Math.max(5, settings.reminderIntervalMinutes || 15);
  const remindersCount = Math.max(1, Math.round(totalActiveMinutes / interval));

  // Sip amount per reminder & refills
  const sipMl = Math.max(1, Math.round(goalMl / remindersCount));
  const sipsPerBottle = Math.max(1, Math.round(settings.bottleSizeMl / sipMl));
  const refillsCount = Math.max(0, Math.ceil(goalMl / settings.bottleSizeMl) - 1);

  // Next reminder calculation
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = settings.startHour * 60;
  const endMinutes = settings.endHour * 60;

  const isWithinActiveHours =
    startMinutes <= endMinutes
      ? currentMinutes >= startMinutes && currentMinutes < endMinutes
      : currentMinutes >= startMinutes || currentMinutes < endMinutes;

  let nextReminderMinutes = 0;
  let nextReminderInMinutes = 0;

  if (currentMinutes < startMinutes) {
    nextReminderMinutes = startMinutes;
    nextReminderInMinutes = startMinutes - currentMinutes;
  } else if (!isWithinActiveHours) {
    // Tomorrow start
    nextReminderMinutes = startMinutes;
    nextReminderInMinutes = 24 * 60 - currentMinutes + startMinutes;
  } else {
    // Currently active: find next interval point
    const elapsedSinceStart = currentMinutes - startMinutes;
    const intervalsPassed = Math.floor(elapsedSinceStart / interval);
    const nextIntervalMinute = startMinutes + (intervalsPassed + 1) * interval;
    if (nextIntervalMinute <= endMinutes) {
      nextReminderMinutes = nextIntervalMinute;
      nextReminderInMinutes = nextIntervalMinute - currentMinutes;
    } else {
      nextReminderMinutes = startMinutes;
      nextReminderInMinutes = 24 * 60 - currentMinutes + startMinutes;
    }
  }

  const nextH = Math.floor((nextReminderMinutes % (24 * 60)) / 60);
  const nextM = (nextReminderMinutes % (24 * 60)) % 60;
  const nextReminderTime = `${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`;

  return {
    goalMl,
    drunkMl,
    progressPercent,
    remindersCount,
    refillsCount,
    sipMl,
    sipsPerBottle,
    nextReminderTime,
    nextReminderInMinutes,
    isWithinActiveHours,
  };
}

// Background scheduler for water reminders
const triggeredSlots = new Set<string>();
let lastTrackedDay = "";

export function clearTriggeredWaterSlots() {
  triggeredSlots.clear();
}

setInterval(() => {
  const now = new Date();
  const today = getTodayDateString();

  if (today !== lastTrackedDay) {
    triggeredSlots.clear();
    lastTrackedDay = today;
  }

  const s = waterSettings.get();
  if (!s.notificationsEnabled) return;

  // Don't re-trigger while an alert banner is actively showing
  if (waterAlertStore.get().active) return;

  const summary = calculateWaterSummary(s, waterLog.get(), now);
  if (!summary.isWithinActiveHours) return;

  const interval = Math.max(5, s.reminderIntervalMinutes || 15);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = s.startHour * 60;

  const elapsedSinceStart =
    currentMinutes >= startMinutes
      ? currentMinutes - startMinutes
      : currentMinutes + 24 * 60 - startMinutes;

  // Exact interval minute match (e.g. 08:00, 08:15, 08:30...)
  if (elapsedSinceStart >= 0 && elapsedSinceStart % interval === 0) {
    const currentSlotKey = `${today}_${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;

    if (!triggeredSlots.has(currentSlotKey)) {
      triggeredSlots.add(currentSlotKey);

      // Skip reminder if the user already logged a drink in the last 3 minutes
      const log = waterLog.get();
      const lastRecord = log.records[log.records.length - 1];
      const isRecentDrink =
        lastRecord &&
        log.date === today &&
        now.getTime() - lastRecord.timestamp < 3 * 60 * 1000;

      if (!isRecentDrink) {
        triggerWaterAlert();
      }
    }
  }
}, 3000);
