export type PrayerName = "Subuh" | "Dzuhur" | "Ashar" | "Maghrib" | "Isya";

export interface PrayerItem {
  id: PrayerName;
  name: string;
  time: string; // "04:07"
  date: Date;
  passed: boolean;
}

export interface PrayerTimesData {
  subuh: string;
  terbit: string;
  dzuhur: string;
  ashar: string;
  maghrib: string;
  isya: string;
  items: PrayerItem[];
  next: {
    prayer: PrayerItem;
    remainingMs: number;
    inMinutes: number;
    inHours: number;
    progress: number; // 0 to 1 between previous and next prayer
  };
  sunProgress: number; // 0 to 1 along the daylight / prayer curve
}

export interface PrayerSettings {
  gentleReminder: boolean;
  reminderVolume: number;
  autoPauseMusic: boolean;
  notifyOnTime: boolean;
  notifyBeforeMinutes: number;
  city?: string;
  lat?: number;
  lon?: number;
  autoLocation?: boolean;
}
