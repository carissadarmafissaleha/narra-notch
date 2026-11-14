export interface WaterSettings {
  bottleSizeMl: number; // e.g. 500
  dailyGoalL: number; // e.g. 1.5, 2.0, 2.5, 3.0
  startHour: number; // 8 (08:00)
  endHour: number; // 17 (17:00)
  reminderIntervalMinutes: number; // default 15
  notificationsEnabled: boolean; // default true
  soundEnabled: boolean; // default true
  reminderVolume: number; // 0.0 - 1.0
  drinkStepMl: number; // default 250 ml per drink tap
}

export interface WaterLogRecord {
  id: string;
  timestamp: number;
  ml: number;
}

export interface WaterLog {
  date: string; // YYYY-MM-DD
  drunkMl: number;
  records: WaterLogRecord[];
}

export interface WaterSummary {
  goalMl: number;
  drunkMl: number;
  progressPercent: number;
  remindersCount: number;
  refillsCount: number;
  sipMl: number;
  sipsPerBottle: number;
  nextReminderTime: string;
  nextReminderInMinutes: number;
  isWithinActiveHours: boolean;
}
