import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CaretLeft,
  CaretRight,
  SpeakerHigh,
  Bell,
  MusicNoteSimple,
  Lightning,
} from "@phosphor-icons/react";
import { useNowPlaying } from "../../platform/media";
import { navigate } from "../../notch/nav";
import { content, springs } from "../../design/motion";
import { t, locale } from "../../i18n";
import { settings as appSettings } from "../../settings/store";
import { SunArc } from "./SunArc";
import {
  prayerSettings,
  prayerStore,
  pauseMusicIfPlaying,
  triggerPrayerAlert,
} from "./store";
import { playGentlePrayerChime } from "./sound";

export function PrayerView() {
  const [activeSlide, setActiveSlide] = useState<0 | 1>(0);
  const { data, now, city } = prayerStore.use();
  const settings = prayerSettings.use();
  const weatherState = appSettings.use().weather;
  const np = useNowPlaying();
  const [testingChime, setTestingChime] = useState(false);

  const next = data.next;
  const nextItem = next.prayer;

  // Format current date and time matching the screenshot pill
  const dateFormatted = new Intl.DateTimeFormat(locale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(now);

  const hoursStr = String(now.getHours()).padStart(2, "0");
  const minutesStr = String(now.getMinutes()).padStart(2, "0");
  const timeFormatted = `${hoursStr}:${minutesStr}`;

  // Countdown text
  let countdownText = "";
  if (next.inMinutes <= 0) {
    countdownText = t("Now");
  } else if (next.inHours > 0) {
    const remMins = next.inMinutes % 60;
    countdownText = `in ${next.inHours}h ${remMins > 0 ? `${remMins}m` : ""}`;
  } else {
    countdownText = `in ${next.inMinutes} min`;
  }

  const handleTestChime = () => {
    setTestingChime(true);
    playGentlePrayerChime(settings.reminderVolume);
    setTimeout(() => setTestingChime(false), 3000);
  };

  const lastWheelTime = useRef(0);
  const handleWheel = (e: React.WheelEvent) => {
    const nowMs = Date.now();
    if (nowMs - lastWheelTime.current < 200) return;
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(delta) < 8) return;
    lastWheelTime.current = nowMs;
    setActiveSlide((curr) => (curr === 0 ? 1 : 0));
  };

  return (
    <div onWheel={handleWheel} className="flex h-full flex-col justify-between px-5 pt-1.5 pb-2.5 text-white select-none">
      {/* Top Header matching user's notch screenshot */}
      <div className="flex items-center justify-between pb-1">
        {/* Left: City & Kemenag RI badge (matches Weather location) */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigate("weather")}
            className="pressable rounded-full bg-white/[0.08] px-2 py-0.5 text-caption font-medium text-white/70 hover:bg-white/[0.14] hover:text-white"
            title={t("Wetter öffnen")}
          >
            {city} · Kemenag
          </button>
        </div>

        {/* Center: Status pill badge with monochrome lightning and date/time */}
        <div className="flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-0.5 text-[11px] font-medium text-white/90 shadow-inner">
          <span className="flex size-3.5 items-center justify-center rounded-full bg-white/10 text-white/80">
            <Lightning size={10} weight="fill" />
          </span>
          <span className="tabular text-white/80">{dateFormatted}</span>
          <span className="tabular font-bold text-white">{timeFormatted}</span>
        </div>

        {/* Right: Audio / Music indicator icon */}
        <button
          onClick={() => {
            if (np?.isPlaying) {
              pauseMusicIfPlaying();
            } else {
              navigate("media");
            }
          }}
          className="pressable flex size-6 items-center justify-center rounded-full text-white/60 hover:text-white"
          title={np?.isPlaying ? t("Pause music") : t("Open Media")}
        >
          {np?.isPlaying ? (
            <span className="flex items-end gap-0.5 text-white/90">
              <span className="h-2 w-0.5 animate-pulse rounded-full bg-current" />
              <span className="h-3.5 w-0.5 animate-pulse rounded-full bg-current delay-75" />
              <span className="h-1.5 w-0.5 animate-pulse rounded-full bg-current delay-150" />
              <span className="h-3 w-0.5 animate-pulse rounded-full bg-current delay-100" />
            </span>
          ) : (
            <MusicNoteSimple size={15} weight="bold" />
          )}
        </button>
      </div>

      {/* Main Slide Carousel Area */}
      <div className="relative min-h-[110px] flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {activeSlide === 0 ? (
            /* Slide 0: The exact Sun Arc & Next Prayer card as shown in image */
            <motion.div
              key="slide-main"
              className="flex h-full items-center justify-between gap-3 pt-1"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0, transition: content.enter }}
              exit={{ opacity: 0, x: 16, transition: content.exit }}
            >
              {/* Left Column: Next Prayer Info */}
              <div className="flex flex-1 items-center gap-2">
                {/* Left Carousel Arrow Button */}
                <button
                  onClick={() => setActiveSlide(1)}
                  className="pressable flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/70 hover:bg-white/[0.14] hover:text-white"
                  aria-label={t("Settings")}
                >
                  <CaretLeft size={13} weight="bold" />
                </button>

                <div className="flex flex-col pl-1">
                  <span className="text-[11px] font-medium tracking-wide text-white/40">{t("Next")}</span>
                  <span className="text-[26px] leading-tight font-extrabold tracking-tight text-tint transition-colors duration-300">
                    {nextItem.name}
                  </span>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="tabular text-body font-bold text-tint transition-colors duration-300">{nextItem.time}</span>
                    <span className="tabular text-caption font-semibold text-white/80">{countdownText}</span>
                  </div>

                  {/* Themed Progress Bar */}
                  <div className="mt-2.5 h-[5px] w-28 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      className="h-full rounded-full bg-tint transition-colors duration-300"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round(next.progress * 100)}%` }}
                      transition={springs.snappy}
                    />
                  </div>
                </div>
              </div>

              {/* Vertical Separator Divider */}
              <div className="h-16 w-[1px] bg-white/[0.12]" />

              {/* Right Column: Sun Arc & Next Arrow Button */}
              <div className="flex flex-[1.4] items-center justify-end gap-1.5">
                <SunArc data={data} activePrayerId={nextItem.id} />
                <button
                  onClick={() => setActiveSlide(1)}
                  className="pressable flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/70 hover:bg-white/[0.14] hover:text-white"
                  aria-label={t("Settings")}
                >
                  <CaretRight size={13} weight="bold" />
                </button>
              </div>
            </motion.div>
          ) : (
            /* Slide 1: Quick Settings (Gentle chime, auto pause, notifications, synced weather location) */
            <motion.div
              key="slide-settings"
              className="flex h-full flex-col justify-center gap-2 pt-1 text-footnote"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0, transition: content.enter }}
              exit={{ opacity: 0, x: -16, transition: content.exit }}
            >
              <div className="grid grid-cols-2 gap-2">
                {/* Weather Location Info Card (Synchronized with Weather Settings) */}
                <div className="flex flex-col justify-between rounded-xl bg-white/[0.05] p-2">
                  <div className="flex items-center justify-between text-caption text-white/50">
                    <span>{t("Standort")}</span>
                    <span className="text-[10px] text-white/40">
                      {weatherState?.auto ? t("Automatisch") : t("Manuell")}
                    </span>
                  </div>
                  <button
                    onClick={() => navigate("weather")}
                    className="pressable mt-1 flex items-center justify-between rounded-lg bg-white/10 px-2.5 py-1.5 text-caption font-semibold text-white hover:bg-white/20"
                    title={t("Wetter öffnen")}
                  >
                    <span className="truncate">{city}</span>
                    <span className="text-[10px] text-white/50">{t("Wetter")} →</span>
                  </button>
                </div>

                {/* Gentle chime switch + test */}
                <div className="flex flex-col justify-between rounded-xl bg-white/[0.05] p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-caption font-medium text-white/80">{t("Gentle Chime")}</span>
                    <button
                      onClick={() =>
                        prayerSettings.set((s) => ({
                          ...s,
                          gentleReminder: !s.gentleReminder,
                        }))
                      }
                      className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${
                        settings.gentleReminder ? "bg-white" : "bg-white/20"
                      }`}
                    >
                      <div
                        className={`size-3 rounded-full transition-transform ${
                          settings.gentleReminder ? "translate-x-3 bg-black" : "translate-x-0 bg-white"
                        }`}
                      />
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <button
                      onClick={handleTestChime}
                      disabled={testingChime}
                      className="pressable flex flex-1 items-center justify-center gap-1 rounded-md bg-white/10 py-1 text-[10px] font-medium text-white/90 hover:bg-white/20"
                    >
                      <SpeakerHigh size={11} weight="bold" />
                      <span>{testingChime ? t("Ringing …") : t("Test Chime")}</span>
                    </button>
                    <button
                      onClick={() => triggerPrayerAlert()}
                      className="pressable flex flex-1 items-center justify-center gap-1 rounded-md bg-white/10 py-1 text-[10px] font-medium text-white/90 hover:bg-white/20"
                    >
                      <Bell size={11} weight="bold" />
                      <span>{t("Test Notif")}</span>
                    </button>
                  </div>
                </div>

                {/* Auto pause music */}
                <div className="flex items-center justify-between rounded-xl bg-white/[0.05] px-2.5 py-1.5">
                  <span className="text-caption font-medium text-white/80">{t("Auto Pause Music")}</span>
                  <button
                    onClick={() =>
                      prayerSettings.set((s) => ({
                        ...s,
                        autoPauseMusic: !s.autoPauseMusic,
                      }))
                    }
                    className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${
                      settings.autoPauseMusic ? "bg-white" : "bg-white/20"
                    }`}
                  >
                    <div
                      className={`size-3 rounded-full transition-transform ${
                        settings.autoPauseMusic ? "translate-x-3 bg-black" : "translate-x-0 bg-white"
                      }`}
                    />
                  </button>
                </div>

                {/* Windows Notification */}
                <div className="flex items-center justify-between rounded-xl bg-white/[0.05] px-2.5 py-1.5">
                  <span className="text-caption font-medium text-white/80">{t("Prayer Notification")}</span>
                  <button
                    onClick={() =>
                      prayerSettings.set((s) => ({
                        ...s,
                        notifyOnTime: !s.notifyOnTime,
                      }))
                    }
                    className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${
                      settings.notifyOnTime ? "bg-white" : "bg-white/20"
                    }`}
                  >
                    <div
                      className={`size-3 rounded-full transition-transform ${
                        settings.notifyOnTime ? "translate-x-3 bg-black" : "translate-x-0 bg-white"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom carousel pagination dots */}
      <div className="flex items-center justify-center gap-1.5 pt-1">
        <button
          onClick={() => setActiveSlide(0)}
          className={`h-1 rounded-full transition-all duration-200 ${
            activeSlide === 0 ? "w-5 bg-white" : "w-1.5 bg-white/30 hover:bg-white/50"
          }`}
          aria-label="Busur Matahari"
        />
        <button
          onClick={() => setActiveSlide(1)}
          className={`h-1 rounded-full transition-all duration-200 ${
            activeSlide === 1 ? "w-5 bg-white" : "w-1.5 bg-white/30 hover:bg-white/50"
          }`}
          aria-label="Pengaturan"
        />
      </div>
    </div>
  );
}
