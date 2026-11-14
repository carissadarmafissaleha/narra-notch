import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Drop,
  Sliders,
  Bell,
  BellSlash,
  Plus,
  Minus,
  Trash,
  CaretLeft,
  CaretRight,
  Lightning,
  ArrowCounterClockwise,
  Check,
} from "@phosphor-icons/react";
import { content } from "../../design/motion";
import { t, locale } from "../../i18n";
import {
  waterSettings,
  waterLog,
  calculateWaterSummary,
  drinkWater,
  resetTodayWater,
  resetWaterSettings,
  triggerWaterAlert,
} from "./store";
import { WaterRing } from "./WaterRing";

export function WaterView() {
  const [activeSlide, setActiveSlide] = useState<0 | 1>(0);
  const settings = waterSettings.use();
  const log = waterLog.use();
  const [now, setNow] = useState(new Date());
  const [recentAdded, setRecentAdded] = useState<number | null>(null);
  const [resetTodayFeedback, setResetTodayFeedback] = useState(false);
  const [resetLogFeedback, setResetLogFeedback] = useState(false);
  const [resetSettingsFeedback, setResetSettingsFeedback] = useState(false);

  // Update clock every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(timer);
  }, []);

  const summary = calculateWaterSummary(settings, log, now);

  // Date and time formatting
  const dateFormatted = new Intl.DateTimeFormat(locale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(now);

  const hoursStr = String(now.getHours()).padStart(2, "0");
  const minutesStr = String(now.getMinutes()).padStart(2, "0");
  const timeFormatted = `${hoursStr}:${minutesStr}`;

  // Mouse wheel scroll to switch slides
  const lastWheelTime = useRef(0);
  const handleWheel = (e: React.WheelEvent) => {
    const nowMs = Date.now();
    if (nowMs - lastWheelTime.current < 220) return;
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(delta) < 10) return;
    lastWheelTime.current = nowMs;
    setActiveSlide((curr) => (curr === 0 ? 1 : 0));
  };

  const handleDrink = (amount?: number) => {
    const ml = amount ?? settings.drinkStepMl;
    drinkWater(ml);
    setRecentAdded(ml);
    setTimeout(() => setRecentAdded(null), 1800);
  };

  const handleResetToday = () => {
    resetTodayWater();
    setResetTodayFeedback(true);
    setTimeout(() => setResetTodayFeedback(false), 1800);
  };

  const handleResetLog = () => {
    resetTodayWater();
    setResetLogFeedback(true);
    setTimeout(() => setResetLogFeedback(false), 1800);
  };

  const handleResetSettings = () => {
    resetWaterSettings();
    setResetSettingsFeedback(true);
    setTimeout(() => setResetSettingsFeedback(false), 1800);
  };

  const toggleNotifications = () => {
    const nextVal = !settings.notificationsEnabled;
    if (nextVal && "Notification" in window && Notification.permission !== "granted") {
      void Notification.requestPermission();
    }
    waterSettings.set((s) => ({
      ...s,
      notificationsEnabled: nextVal,
    }));
  };

  const handleTestNotif = () => {
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission().then(() => {
        triggerWaterAlert();
      });
    } else {
      triggerWaterAlert();
    }
  };

  const adjustBottleSize = (delta: number) => {
    waterSettings.set((s) => ({
      ...s,
      bottleSizeMl: Math.max(100, Math.min(2000, s.bottleSizeMl + delta)),
    }));
  };

  const setGoal = (goalL: number) => {
    waterSettings.set((s) => ({ ...s, dailyGoalL: goalL }));
  };

  const adjustStartHour = (delta: number) => {
    waterSettings.set((s) => {
      const nextH = (s.startHour + delta + 24) % 24;
      return { ...s, startHour: nextH };
    });
  };

  const adjustEndHour = (delta: number) => {
    waterSettings.set((s) => {
      const nextH = (s.endHour + delta + 24) % 24;
      return { ...s, endHour: nextH };
    });
  };

  return (
    <div
      onWheel={handleWheel}
      className="flex h-full flex-col justify-between px-5 pt-1 pb-2 text-white select-none overflow-hidden"
    >
      {/* Sub-bar: Status Pill & Controls only (NO duplicate header title) */}
      <div className="flex h-5 items-center justify-between">
        {activeSlide === 1 ? (
          <button
            onClick={() => setActiveSlide(0)}
            className="pressable -ml-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-white/80 hover:bg-white/[0.08] hover:text-white"
          >
            <CaretLeft size={13} weight="bold" />
            <span className="text-[11px] font-semibold tracking-tight text-white">{t("Overview") || "Kembali"}</span>
          </button>
        ) : (
          <div className="text-[11px] font-medium text-white/50 tracking-wide">
            {t("Daily Goal") || "Target Harian"}
          </div>
        )}

        {/* Center Pill: Status & DateTime */}
        <div className="flex items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 py-0.5 text-[10px] font-medium text-white/90 shadow-inner">
          <span className="flex size-3 items-center justify-center rounded-full bg-white/10 text-white/80">
            <Lightning size={9} weight="fill" />
          </span>
          <span className="tabular text-white/70">{dateFormatted}</span>
          <span className="tabular font-bold text-white">{timeFormatted}</span>
        </div>
      </div>

      {/* Main Slide Carousel Area */}
      <div className="relative min-h-[135px] flex-1 overflow-hidden flex items-center">
        <AnimatePresence mode="wait" initial={false}>
          {activeSlide === 0 ? (
            /* SLIDE 0: Main Water Tracker View */
            <motion.div
              key="slide-main"
              className="flex w-full items-center justify-between gap-5 pt-0.5"
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0, transition: content.enter }}
              exit={{ opacity: 0, x: 14, transition: content.exit }}
            >
              {/* Left Column: Progress Numbers & Actions */}
              <div className="flex flex-1 flex-col justify-center">
                {/* Number & Notification Toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[30px] font-black leading-none tracking-tight text-tint transition-colors duration-300 tabular">
                      {(summary.drunkMl / 1000).toFixed(1)}
                    </span>
                    <span className="text-[16px] font-bold text-white/50 tabular">
                      / {(settings.dailyGoalL).toFixed(1)} L
                    </span>
                  </div>

                  {/* Notification Toggle Button */}
                  <button
                    onClick={toggleNotifications}
                    className={`pressable flex size-7 items-center justify-center rounded-full transition-all ${
                      settings.notificationsEnabled
                        ? "bg-white text-black shadow-sm"
                        : "bg-white/[0.08] text-white/40 hover:bg-white/[0.14]"
                    }`}
                    title={
                      settings.notificationsEnabled
                        ? t("Notifications On")
                        : t("Notifications Off")
                    }
                  >
                    {settings.notificationsEnabled ? (
                      <Bell size={14} weight="fill" />
                    ) : (
                      <BellSlash size={14} weight="bold" />
                    )}
                  </button>
                </div>

                {/* Subtitle / Next Reminder */}
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-white/70">
                  <span>{t("Today")}</span>
                  <span className="text-white/30">·</span>
                  <span className="font-bold text-white">{summary.progressPercent}%</span>
                  <span className="text-white/30">·</span>
                  <span>{t("Next")} {summary.nextReminderTime}</span>
                  {recentAdded !== null && (
                    <span className="ml-1 text-[10px] font-bold text-white animate-pulse">
                      +{recentAdded} ml
                    </span>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="mt-2.5 h-[5px] w-full overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-white"
                    initial={{ width: 0 }}
                    animate={{ width: `${summary.progressPercent}%` }}
                    transition={{ type: "spring", damping: 25, stiffness: 120 }}
                  />
                </div>

                {/* Bottom Action Buttons: Drink, Reset, Settings */}
                <div className="mt-3.5 flex items-center gap-2">
                  <button
                    onClick={() => handleDrink(summary.sipMl)}
                    className="pressable flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1 text-[12px] font-bold text-black shadow-sm hover:bg-white/90"
                  >
                    <Drop size={13} weight="fill" />
                    <span>{t("Drink")}</span>
                  </button>

                  <button
                    onClick={handleResetToday}
                    className={`pressable flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                      resetTodayFeedback
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-white/[0.08] text-white/70 hover:bg-white/[0.14] hover:text-white"
                    }`}
                    title={t("Reset today's water intake")}
                  >
                    {resetTodayFeedback ? (
                      <>
                        <Check size={11} weight="bold" />
                        <span>{t("Reset Done!")}</span>
                      </>
                    ) : (
                      <>
                        <ArrowCounterClockwise size={11} weight="bold" />
                        <span>{t("Reset")}</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveSlide(1)}
                    className="pressable flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-1 text-[12px] font-medium text-white/90 hover:bg-white/[0.14] hover:text-white"
                  >
                    <Sliders size={13} weight="bold" />
                    <span>{t("Settings")}</span>
                  </button>
                </div>
              </div>

              {/* Vertical divider */}
              <div className="h-24 w-px bg-white/10" />

              {/* Right Column: Circular Ring & Carousel Controls */}
              <div className="flex items-center gap-2 pr-0.5">
                <button
                  onClick={() => setActiveSlide(1)}
                  className="pressable flex size-6 items-center justify-center rounded-full bg-white/[0.06] text-white/60 hover:bg-white/[0.12] hover:text-white"
                  aria-label="Settings"
                >
                  <CaretLeft size={12} weight="bold" />
                </button>

                <div className="flex flex-col items-center">
                  <WaterRing progressPercent={summary.progressPercent} size={88} />
                </div>

                <button
                  onClick={() => setActiveSlide(1)}
                  className="pressable flex size-6 items-center justify-center rounded-full bg-white/[0.06] text-white/60 hover:bg-white/[0.12] hover:text-white"
                  aria-label="Settings"
                >
                  <CaretRight size={12} weight="bold" />
                </button>
              </div>
            </motion.div>
          ) : (
            /* SLIDE 1: Water Settings View */
            <motion.div
              key="slide-settings"
              className="flex w-full items-center justify-between gap-4 pt-0.5"
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0, transition: content.enter }}
              exit={{ opacity: 0, x: -14, transition: content.exit }}
            >
              {/* Left Controls with clean spacing */}
              <div className="flex flex-1 flex-col justify-between gap-3">
                {/* Row 1: Bottle Size */}
                <div className="flex items-center gap-3">
                  <span className="w-14 text-[12px] font-bold text-white/80">{t("Bottle")}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => adjustBottleSize(-50)}
                      className="pressable flex size-5 items-center justify-center rounded-full bg-white/[0.08] text-white/80 hover:bg-white/[0.16] hover:text-white"
                    >
                      <Minus size={10} weight="bold" />
                    </button>
                    <span className="w-16 text-center text-[12px] font-black text-white tabular">
                      {settings.bottleSizeMl} ml
                    </span>
                    <button
                      onClick={() => adjustBottleSize(50)}
                      className="pressable flex size-5 items-center justify-center rounded-full bg-white/[0.08] text-white/80 hover:bg-white/[0.16] hover:text-white"
                    >
                      <Plus size={10} weight="bold" />
                    </button>
                  </div>
                  <span className="text-[10px] font-medium text-white/40 truncate">
                    {summary.sipsPerBottle} {t("sips")}/{t("bottle")}
                  </span>
                </div>

                {/* Row 2: Goal Presets */}
                <div className="flex items-center gap-3">
                  <span className="w-14 text-[12px] font-bold text-white/80">{t("Goal")}</span>
                  <div className="flex items-center gap-1.5">
                    {[1.5, 2.0, 2.5, 3.0].map((goal) => {
                      const isSelected = settings.dailyGoalL === goal;
                      return (
                        <div key={goal} className="flex flex-col items-center gap-0.5">
                          <span
                            className={`size-1 rounded-full ${
                              isSelected ? "bg-white" : "bg-transparent"
                            }`}
                          />
                          <button
                            onClick={() => setGoal(goal)}
                            className={`pressable rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-all ${
                              isSelected
                                ? "bg-white text-black shadow-sm"
                                : "bg-white/[0.08] text-white/70 hover:bg-white/[0.14] hover:text-white"
                            }`}
                          >
                            {goal.toFixed(1)} L
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Row 3: Active Hours */}
                <div className="flex items-center gap-3">
                  <span className="w-14 text-[12px] font-bold text-white/80">{t("Hours")}</span>
                  <div className="flex items-center gap-1">
                    {/* Start Hour */}
                    <button
                      onClick={() => adjustStartHour(-1)}
                      className="pressable flex size-5 items-center justify-center rounded-full bg-white/[0.08] text-white/80 hover:bg-white/[0.16] hover:text-white"
                    >
                      <Minus size={10} weight="bold" />
                    </button>
                    <span className="w-12 text-center text-[11px] font-bold text-white tabular">
                      {String(settings.startHour).padStart(2, "0")}:00
                    </span>
                    <button
                      onClick={() => adjustStartHour(1)}
                      className="pressable flex size-5 items-center justify-center rounded-full bg-white/[0.08] text-white/80 hover:bg-white/[0.16] hover:text-white"
                    >
                      <Plus size={10} weight="bold" />
                    </button>

                    <span className="px-1 text-[11px] font-medium text-white/40">{t("to")}</span>

                    {/* End Hour */}
                    <button
                      onClick={() => adjustEndHour(-1)}
                      className="pressable flex size-5 items-center justify-center rounded-full bg-white/[0.08] text-white/80 hover:bg-white/[0.16] hover:text-white"
                    >
                      <Minus size={10} weight="bold" />
                    </button>
                    <span className="w-12 text-center text-[11px] font-bold text-white tabular">
                      {String(settings.endHour).padStart(2, "0")}:00
                    </span>
                    <button
                      onClick={() => adjustEndHour(1)}
                      className="pressable flex size-5 items-center justify-center rounded-full bg-white/[0.08] text-white/80 hover:bg-white/[0.16] hover:text-white"
                    >
                      <Plus size={10} weight="bold" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Summary Card: Clean, Wide, NO Overlap */}
              <div className="flex flex-col items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] p-2 text-center w-[124px] shrink-0">
                <div className="flex items-center justify-around w-full pb-0.5">
                  <div>
                    <div className="text-[16px] font-black leading-none text-white tabular">
                      {summary.remindersCount}
                    </div>
                    <div className="mt-0.5 text-[9px] font-medium text-white/50">
                      {t("reminders")}
                    </div>
                  </div>

                  <div className="h-5 w-px bg-white/10" />

                  <div>
                    <div className="text-[16px] font-black leading-none text-white tabular">
                      {summary.refillsCount}
                    </div>
                    <div className="mt-0.5 text-[9px] font-medium text-white/50">
                      {t("refills")}
                    </div>
                  </div>
                </div>

                {/* Stacked Full-Width Buttons */}
                <div className="mt-1.5 flex flex-col gap-1 w-full">
                  <button
                    onClick={handleTestNotif}
                    className="pressable flex h-[20px] w-full items-center justify-center gap-1 rounded-md bg-white/[0.08] px-1.5 text-[10px] font-semibold text-white/90 hover:bg-white/[0.16] hover:text-white shadow-sm"
                    title="Uji coba banner notifikasi di notch"
                  >
                    <Bell size={10} weight="bold" />
                    <span>{t("Test Notif")}</span>
                  </button>

                  <button
                    onClick={handleResetLog}
                    className={`pressable flex h-[20px] w-full items-center justify-center gap-1 rounded-md px-1.5 text-[10px] font-semibold transition-all shadow-sm ${
                      resetLogFeedback
                        ? "bg-emerald-500/30 text-emerald-300 border border-emerald-500/40"
                        : "bg-white/[0.08] text-white/80 hover:bg-white/[0.16] hover:text-white"
                    }`}
                    title={t("Reset water intake today")}
                  >
                    {resetLogFeedback ? (
                      <>
                        <Check size={10} weight="bold" />
                        <span>{t("Reset Done!")}</span>
                      </>
                    ) : (
                      <>
                        <Trash size={10} weight="bold" />
                        <span>{t("Reset Log")}</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleResetSettings}
                    className={`pressable flex h-[20px] w-full items-center justify-center gap-1 rounded-md px-1.5 text-[10px] font-semibold transition-all shadow-sm ${
                      resetSettingsFeedback
                        ? "bg-emerald-500/30 text-emerald-300 border border-emerald-500/40"
                        : "bg-white/[0.08] text-white/60 hover:bg-white/[0.16] hover:text-white"
                    }`}
                    title={t("Reset settings to default")}
                  >
                    {resetSettingsFeedback ? (
                      <>
                        <Check size={10} weight="bold" />
                        <span>{t("Default Done!")}</span>
                      </>
                    ) : (
                      <>
                        <ArrowCounterClockwise size={10} weight="bold" />
                        <span>{t("Reset Settings")}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Carousel Indicator Dots */}
      <div className="flex h-3 items-center justify-center gap-1">
        <button
          onClick={() => setActiveSlide(0)}
          className={`h-1 transition-all rounded-full ${
            activeSlide === 0 ? "w-5 bg-white" : "w-1.5 bg-white/30 hover:bg-white/50"
          }`}
          aria-label="Water overview"
        />
        <button
          onClick={() => setActiveSlide(1)}
          className={`h-1 transition-all rounded-full ${
            activeSlide === 1 ? "w-5 bg-white" : "w-1.5 bg-white/30 hover:bg-white/50"
          }`}
          aria-label="Water settings"
        />
      </div>
    </div>
  );
}
