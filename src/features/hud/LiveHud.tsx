import { motion } from "motion/react";
import {
  SpeakerHigh,
  SpeakerLow,
  SpeakerSimpleSlash,
  Sun,
  ArrowFatUp,
  Globe,
  BatteryCharging,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
  WifiHigh,
  WifiSlash,
  Bluetooth,
  BluetoothSlash,
} from "@phosphor-icons/react";
import { content } from "../../design/motion";
import { hudStore } from "./store";

export function LiveHud() {
  const hud = hudStore.use();

  // Pick appropriate Phosphor icon based on type and value
  const renderIcon = () => {
    switch (hud.type) {
      case "volume":
        if (hud.label.toLowerCase().includes("mute") || hud.label.toLowerCase().includes("bisu") || hud.value === 0) {
          return <SpeakerSimpleSlash size={16} weight="bold" className="text-white/60" />;
        }
        if ((hud.value ?? 0) < 50) {
          return <SpeakerLow size={16} weight="bold" className="text-white" />;
        }
        return <SpeakerHigh size={16} weight="fill" className="text-white" />;

      case "brightness":
        return <Sun size={16} weight="fill" className="text-white" />;

      case "capslock":
        return <ArrowFatUp size={16} weight="fill" className="text-white" />;

      case "language":
        return <Globe size={16} weight="bold" className="text-white" />;

      case "battery":
        if (hud.sublabel?.toLowerCase().includes("charg") || hud.sublabel?.toLowerCase().includes("mengisi")) {
          return <BatteryCharging size={17} weight="fill" className="text-white" />;
        }
        if ((hud.value ?? 0) < 20) {
          return <BatteryLow size={17} weight="bold" className="text-white" />;
        }
        if ((hud.value ?? 0) < 60) {
          return <BatteryMedium size={17} weight="bold" className="text-white" />;
        }
        return <BatteryFull size={17} weight="fill" className="text-white" />;

      case "wifi":
        if (hud.label.toLowerCase().includes("disconnect") || hud.label.toLowerCase().includes("terputus")) {
          return <WifiSlash size={16} weight="bold" className="text-white/50" />;
        }
        return <WifiHigh size={16} weight="bold" className="text-white" />;

      case "bluetooth":
        if (hud.label.toLowerCase().includes("inactive") || hud.label.toLowerCase().includes("nonaktif")) {
          return <BluetoothSlash size={16} weight="bold" className="text-white/50" />;
        }
        return <Bluetooth size={16} weight="bold" className="text-white" />;

      default:
        return null;
    }
  };

  const isSlider = hud.type === "volume" || hud.type === "brightness";

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-between px-3.5 select-none"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1, transition: content.enter }}
      exit={{ opacity: 0, scale: 0.94, transition: content.exit }}
    >
      {/* Left: Icon & Title */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/12">
          {renderIcon()}
        </span>
        <div className="flex flex-col justify-center leading-none min-w-0">
          <span className="text-[12.5px] font-bold tracking-tight text-white truncate">
            {hud.title}
          </span>
          {hud.sublabel && !isSlider && (
            <span className="mt-0.5 text-[10px] font-medium text-white/60 truncate max-w-[110px]">
              {hud.sublabel}
            </span>
          )}
        </div>
      </div>

      {/* Right: Slider or Badge */}
      <div className="flex items-center gap-2.5 shrink-0">
        {isSlider ? (
          <div className="flex items-center gap-2.5">
            <div className="h-[6px] w-28 overflow-hidden rounded-full bg-white/15">
              <motion.div
                className="h-full rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                initial={false}
                animate={{ width: `${hud.value ?? 0}%` }}
                transition={{ type: "spring", damping: 25, stiffness: 140 }}
              />
            </div>
            <span className="min-w-8 text-right text-[11px] font-bold text-white tabular">
              {hud.label}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {hud.type === "battery" && hud.value !== undefined && (
              <div className="h-[5px] w-14 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${hud.value}%` }}
                />
              </div>
            )}
            <span className="rounded-full bg-white/12 px-2.5 py-0.5 text-[11px] font-bold text-white tracking-wide shadow-sm">
              {hud.label}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
