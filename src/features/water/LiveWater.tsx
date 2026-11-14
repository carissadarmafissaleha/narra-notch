import { motion } from "motion/react";
import { Drop } from "@phosphor-icons/react";
import { content } from "../../design/motion";
import { t } from "../../i18n";
import {
  snoozeWater,
  drankWaterFromBanner,
} from "./store";

export function LiveWater() {

  return (
    <motion.div
      className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-between px-3.5 select-none"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1, transition: content.enter }}
      exit={{ opacity: 0, scale: 0.95, transition: content.exit }}
    >
      {/* Left: Concentric Ripples with Droplet Icon & Labels */}
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Concentric rings wrapper */}
        <div className="relative flex size-[30px] shrink-0 items-center justify-center rounded-full border border-sky-400/30 bg-sky-500/10">
          <div className="flex size-[22px] items-center justify-center rounded-full bg-sky-400/20">
            <Drop size={13} weight="fill" className="text-sky-300" />
          </div>
        </div>

        {/* Text Details */}
        <div className="flex flex-col justify-center leading-tight min-w-0">
          <span className="text-[12.5px] font-bold tracking-tight text-white truncate">
            {t("Time to Drink")}
          </span>
          <span className="text-[10px] font-medium text-white/70 truncate">
            {t("Stay hydrated!")}
          </span>
        </div>
      </div>

      {/* Right: Action Buttons (Snooze & Drank) */}
      <div
        className="pointer-events-auto flex shrink-0 items-center gap-2 ml-2"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            snoozeWater(5);
          }}
          className="pressable pointer-events-auto cursor-pointer flex h-[26px] items-center justify-center rounded-full bg-white/[0.14] px-3 text-[11px] font-semibold text-white/90 hover:bg-white/[0.24] hover:text-white active:scale-95 transition-all"
        >
          {t("Snooze")}
        </button>

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            drankWaterFromBanner();
          }}
          className="pressable pointer-events-auto cursor-pointer flex h-[26px] items-center justify-center rounded-full bg-white px-3.5 text-[11px] font-bold text-black shadow-sm hover:bg-white/90 active:scale-95 transition-all"
        >
          {t("Drank")}
        </button>
      </div>
    </motion.div>
  );
}
