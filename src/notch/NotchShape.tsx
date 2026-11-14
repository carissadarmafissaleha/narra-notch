import { useEffect, useRef, type ReactNode } from "react";
import { animate, motion, useMotionValue, useTransform, type Transition } from "motion/react";
import type { NotchGeometry } from "./geometry";
import { ShapeWidth } from "./liveEdges";
import { settings } from "../settings/store";

interface Props {
  geometry: NotchGeometry;
  transition: Transition;
  /** Shadow only when the notch "floats" over content (open). */
  elevated: boolean;
  children?: ReactNode;
}

/**
 * The notch shape: clean pure-black body with rounded bottom corners.
 *
 * Themes:
 * - "monochrome": classic pure black Dynamic Island, neutral shadow.
 * - "color": same black body; while open, a soft glow and a hairline rim along the
 *   bottom curve pick up the theme tint (`--tint`, set on the notch root).
 */
export function NotchShape({ geometry, transition, elevated, children }: Props) {
  const colored = settings.use().theme === "color";

  const w = useMotionValue(geometry.w);
  const h = useMotionValue(geometry.h);
  const r = useMotionValue(geometry.r);
  const shadow = useMotionValue(elevated ? 1 : 0);

  // Whole device pixels: the shape is centered, so an odd or fractional size puts its edges
  // (and the cover pinned to them) on subpixels that shift every frame, which reads as jitter.
  const wPx = useTransform(w, snap);
  const hPx = useTransform(h, snap);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // Settle to within 0.01 px: the live activity follows the width on subpixels, and
    // Motion's default rest threshold ended every spring with a visible ~0.25 px jump.
    const t = { ...transition, restDelta: 0.01, restSpeed: 0.1 };
    const controls = [animate(w, geometry.w, t), animate(h, geometry.h, t), animate(r, geometry.r, t)];
    return () => controls.forEach((c) => c.stop());
  }, [geometry.w, geometry.h, geometry.r, transition, w, h, r]);

  useEffect(() => {
    const c = animate(shadow, elevated ? 1 : 0, { duration: 0.35, ease: [0.23, 1, 0.32, 1] });
    return () => c.stop();
  }, [elevated, shadow]);

  const shadowBox = colored
    ? "0 20px 48px -14px color-mix(in srgb, var(--tint) 30%, transparent), 0 18px 40px -10px rgb(0 0 0 / 0.7), 0 4px 12px rgb(0 0 0 / 0.35)"
    : "0 18px 40px -10px rgb(0 0 0 / 0.7), 0 4px 12px rgb(0 0 0 / 0.35)";

  return (
    <motion.div className="relative" style={{ width: wPx, height: hPx }}>
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: shadow,
          borderBottomLeftRadius: r,
          borderBottomRightRadius: r,
          boxShadow: shadowBox,
          transition: "box-shadow 450ms var(--ease-out)",
        }}
      />
      <motion.div
        // clip instead of hidden: no scroll container, so focus/scrollIntoView can't shift the content.
        className="absolute inset-0 overflow-clip bg-notch"
        style={{ borderBottomLeftRadius: r, borderBottomRightRadius: r }}
      >
        <ShapeWidth.Provider value={w}>{children}</ShapeWidth.Provider>
      </motion.div>
      {/* Color theme: hairline rim along the bottom curve + a faint wash rising from it. */}
      {colored && (
        <motion.div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: shadow,
            borderBottomLeftRadius: r,
            borderBottomRightRadius: r,
            boxShadow:
              "inset 0 -1px 0 color-mix(in srgb, var(--tint) 38%, transparent), inset 0 -28px 36px -30px color-mix(in srgb, var(--tint) 30%, transparent)",
          }}
        />
      )}
    </motion.div>
  );
}

/** Nearest size that is an even number of device pixels, so both centered edges land on whole pixels. */
function snap(v: number): number {
  const dpr = window.devicePixelRatio || 1;
  return (Math.round((v * dpr) / 2) * 2) / dpr;
}
