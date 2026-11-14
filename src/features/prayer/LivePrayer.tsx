import { motion } from "motion/react";
import { MoonStars } from "@phosphor-icons/react";
import { content } from "../../design/motion";
import { t } from "../../i18n";
import { prayerStore, dismissPrayerAlert } from "./store";

export function LivePrayer() {
  const { data, activeAlert } = prayerStore.use();
  const next = data.next;
  const prayerName = activeAlert ? activeAlert.prayerName : next.prayer.name;
  const prayerTime = activeAlert ? activeAlert.prayerTime : next.prayer.time;

  return (
    <motion.div
      className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-between px-3.5 select-none"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1, transition: content.enter }}
      exit={{ opacity: 0, scale: 0.95, transition: content.exit }}
    >
      {/* Left: Concentric Ripples with Mosque Icon & Labels */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="relative flex size-[30px] shrink-0 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10">
          <div className="flex size-[22px] items-center justify-center rounded-full bg-emerald-400/20">
            <MoonStars size={13} weight="fill" className="text-emerald-300" />
          </div>
        </div>

        <div className="flex flex-col justify-center leading-tight min-w-0">
          <span className="text-[12.5px] font-bold tracking-tight text-white truncate">
            {t("Prayer Time")} · {prayerName}
          </span>
          <span className="text-[10px] font-medium text-white/70 truncate">
            {t("Time for prayer")} · {prayerTime}
          </span>
        </div>
      </div>

      {/* Right: Single Action Button (Laksanakan / Perform) */}
      <div
        className="pointer-events-auto flex shrink-0 items-center ml-2"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            dismissPrayerAlert();
          }}
          className="pressable pointer-events-auto cursor-pointer flex h-[26px] items-center justify-center rounded-full bg-white px-3.5 text-[11px] font-bold text-black shadow-sm hover:bg-white/90 active:scale-95 transition-all"
        >
          {t("Perform")}
        </button>
      </div>
    </motion.div>
  );
}

export function usePrayerLive(): boolean {
  const { activeAlert } = prayerStore.use();
  return activeAlert !== null;
}
