import { useEffect, useState } from "react";

export const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface AgyIndicatorProps {
  active?: boolean;
  size?: number | string;
  className?: string;
}

/**
 * Animated Braille indicator inspired directly by Antigravity (AGY) CLI:
 * - When active (task running, thinking, or tool active): rotates sequentially through
 *   braille glyphs (⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏) with an authentic CLI glow pulse.
 * - When idle (no task / idle): stays completely stationary ("diam") on the base glyph (⠋).
 */
export function AgyIndicator({
  active = true,
  size,
  className = "",
}: AgyIndicatorProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) {
      setFrame(0);
      return;
    }
    const id = setInterval(() => {
      setFrame((prev) => (prev + 1) % BRAILLE_FRAMES.length);
    }, 80);
    return () => clearInterval(id);
  }, [active]);

  const hasTextColor = /text-/.test(className);
  const colorClass = hasTextColor
    ? ""
    : active
    ? "text-cyan-400"
    : "text-zinc-500";

  const glowClass = active
    ? "animate-agy-glow drop-shadow-[0_0_6px_currentColor]"
    : "opacity-60";

  const style = size
    ? { fontSize: typeof size === "number" ? `${size}px` : size, lineHeight: 1 }
    : undefined;

  return (
    <span
      className={`inline-flex items-center justify-center font-mono font-bold select-none leading-none ${colorClass} ${glowClass} ${className}`}
      style={style}
      aria-hidden="true"
    >
      {BRAILLE_FRAMES[active ? frame : 0]}
    </span>
  );
}

