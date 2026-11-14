import { motion } from "motion/react";
import { Drop } from "@phosphor-icons/react";

interface WaterRingProps {
  progressPercent: number; // 0 - 100
  size?: number;
}

export function WaterRing({ progressPercent, size = 88 }: WaterRingProps) {
  const strokeWidth = 7.5;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;

  // Arc of 270 degrees (from 135 deg to 405 deg)
  const startAngle = 135;
  const totalAngle = 270;
  const clampedProgress = Math.max(0, Math.min(100, progressPercent));
  const currentAngle = startAngle + (totalAngle * clampedProgress) / 100;

  // Circumference of full circle
  const circumference = 2 * Math.PI * radius;
  // Arc length for 270 degrees
  const arcLength = (totalAngle / 360) * circumference;
  // Active filled length
  const strokeDashoffset = arcLength - (arcLength * clampedProgress) / 100;

  // Calculate tip indicator coordinates
  const tipAngleRad = (currentAngle * Math.PI) / 180;
  const tipX = center + radius * Math.cos(tipAngleRad);
  const tipY = center + radius * Math.sin(tipAngleRad);

  return (
    <div
      className="relative flex items-center justify-center select-none"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="rotate-[135deg] overflow-visible"
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
        />

        {/* Active Foreground Arc (Themed) */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--tint, #ffffff)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          initial={{ strokeDashoffset: arcLength }}
          animate={{ strokeDashoffset }}
          transition={{ type: "spring", damping: 25, stiffness: 120 }}
          style={{
            filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--tint, #ffffff) 40%, transparent))",
          }}
        />
      </svg>

      {/* Tip Glow Dot at current progress */}
      {clampedProgress > 0 && clampedProgress < 100 && (
        <motion.div
          className="absolute size-2 rounded-full bg-white shadow-[0_0_6px_#ffffff]"
          style={{
            left: tipX - 4,
            top: tipY - 4,
          }}
          initial={false}
          animate={{ left: tipX - 4, top: tipY - 4 }}
          transition={{ type: "spring", damping: 25, stiffness: 120 }}
        />
      )}

      {/* Center Percentage & Droplet */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pt-0.5">
        <span className="text-[20px] font-black leading-none tracking-tight text-tint transition-colors duration-300 tabular">
          {clampedProgress}
        </span>
        <div className="mt-0.5 flex items-center gap-0.5 text-white/80">
          <Drop size={10} weight="fill" className="text-tint transition-colors duration-300" />
          <span className="text-[10px] font-bold leading-none">%</span>
        </div>
      </div>
    </div>
  );
}
