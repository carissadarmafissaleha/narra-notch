import {
  Coordinates,
  PrayerTimes,
  CalculationMethod,
  Madhab,
  HighLatitudeRule,
} from "adhan";
import type { PrayerItem, PrayerTimesData } from "./types";

/**
 * Standard Hisab Rukyat Kementerian Agama Republik Indonesia (Kemenag RI / SIHAT):
 * - Subuh: -20°
 * - Terbit (Syuruq): -0.833° / appx. -2 menit dari sudut astronomi piringan matahari
 * - Ashar: Mazhab Syafi'i (bayangan = 1x tinggi benda + bayangan kulminasi)
 * - Maghrib: -0.833°
 * - Isya: -18°
 * - Ihtiyat (pengaman waktu): +2 menit untuk seluruh waktu sholat wajib
 */
export function createKemenagParams() {
  const params = CalculationMethod.Singapore();
  params.madhab = Madhab.Shafi;
  params.highLatitudeRule = HighLatitudeRule.MiddleOfTheNight;
  // Ihtiyat Kemenag RI (+2 menit seluruh waktu sholat wajib)
  params.adjustments.fajr = 2;
  params.adjustments.sunrise = -2;
  params.adjustments.dhuhr = 2;
  params.adjustments.asr = 2;
  params.adjustments.maghrib = 2;
  params.adjustments.isha = 2;
  return params;
}

/**
 * Automatically determine timezone according to geographic coordinates:
 * - WIT (UTC+9): Maluku, Maluku Utara, Papua (lon >= 125)
 * - WITA (UTC+8): Bali, NTB, NTT, Kalimantan Selatan/Timur/Utara, Sulawesi (114.5 <= lon < 125)
 * - WIB (UTC+7): Sumatera, Jawa, Kalimantan Barat/Tengah (lon < 114.5)
 */
export function getTimezoneForCoords(lat: number, lon: number): string {
  if (lon >= 124.5 && lon <= 142 && lat >= -11.5 && lat <= 6.5) {
    return "Asia/Jayapura";
  }
  if (lon >= 114.5 && lon < 124.5 && lat >= -11.5 && lat <= 6.5) {
    return "Asia/Makassar";
  }
  if (lon >= 95 && lon < 114.5 && lat >= -11.5 && lat <= 6.5) {
    return "Asia/Jakarta";
  }
  if (lon >= 99 && lon <= 120 && lat >= 1 && lat <= 7.5) {
    return "Asia/Kuala_Lumpur";
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta";
  } catch {
    return "Asia/Jakarta";
  }
}

export function computePrayerTimes(
  date: Date,
  lat = -6.2088,
  lon = 106.8456,
  timeZone?: string
): PrayerTimesData {
  const tz = timeZone ?? getTimezoneForCoords(lat, lon);
  const coords = new Coordinates(lat, lon);
  const params = createKemenagParams();

  const ptToday = new PrayerTimes(coords, date, params);
  const fmt = (d: Date): string => {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).format(d);
  };

  const subuhDate = ptToday.fajr;
  const terbitDate = ptToday.sunrise;
  const dzuhurDate = ptToday.dhuhr;
  const asharDate = ptToday.asr;
  const maghribDate = ptToday.maghrib;
  const isyaDate = ptToday.isha;

  const nowMs = date.getTime();
  const items: PrayerItem[] = [
    { id: "Subuh", name: "Subuh", time: fmt(subuhDate), date: subuhDate, passed: nowMs > subuhDate.getTime() },
    { id: "Dzuhur", name: "Dzuhur", time: fmt(dzuhurDate), date: dzuhurDate, passed: nowMs > dzuhurDate.getTime() },
    { id: "Ashar", name: "Ashar", time: fmt(asharDate), date: asharDate, passed: nowMs > asharDate.getTime() },
    { id: "Maghrib", name: "Maghrib", time: fmt(maghribDate), date: maghribDate, passed: nowMs > maghribDate.getTime() },
    { id: "Isya", name: "Isya", time: fmt(isyaDate), date: isyaDate, passed: nowMs > isyaDate.getTime() },
  ];

  // Determine next prayer and progress
  let nextItem = items.find((p) => p.date.getTime() > nowMs);
  let prevDate: Date;

  if (!nextItem) {
    // All prayers today have passed -> next is Subuh tomorrow
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const ptTomorrow = new PrayerTimes(coords, tomorrow, params);
    const tomorrowSubuhDate = ptTomorrow.fajr;

    nextItem = {
      id: "Subuh",
      name: "Subuh",
      time: fmt(tomorrowSubuhDate),
      date: tomorrowSubuhDate,
      passed: false,
    };
    prevDate = isyaDate;
  } else {
    const idx = items.indexOf(nextItem);
    if (idx === 0) {
      // Before Subuh today -> previous was yesterday's Isya
      const yesterday = new Date(date);
      yesterday.setDate(yesterday.getDate() - 1);
      const ptYesterday = new PrayerTimes(coords, yesterday, params);
      prevDate = ptYesterday.isha;
    } else {
      prevDate = items[idx - 1].date;
    }
  }

  const remainingMs = Math.max(0, nextItem.date.getTime() - nowMs);
  const totalSpan = Math.max(1, nextItem.date.getTime() - prevDate.getTime());
  const elapsed = Math.max(0, nowMs - prevDate.getTime());
  const progress = Math.min(1, Math.max(0, elapsed / totalSpan));

  // Sun Arc position: 0 at Subuh (dawn) to 1 at Isya (nightfall)
  const arcStart = subuhDate.getTime();
  const arcEnd = isyaDate.getTime();
  let sunProgress: number;

  if (nowMs <= arcStart) {
    sunProgress = 0;
  } else if (nowMs >= arcEnd) {
    sunProgress = 1;
  } else {
    sunProgress = (nowMs - arcStart) / Math.max(1, arcEnd - arcStart);
  }

  const inMinutes = Math.floor(remainingMs / 60_000);
  const inHours = Math.floor(inMinutes / 60);

  return {
    subuh: fmt(subuhDate),
    terbit: fmt(terbitDate),
    dzuhur: fmt(dzuhurDate),
    ashar: fmt(asharDate),
    maghrib: fmt(maghribDate),
    isya: fmt(isyaDate),
    items,
    next: {
      prayer: nextItem,
      remainingMs,
      inMinutes,
      inHours,
      progress,
    },
    sunProgress,
  };
}
