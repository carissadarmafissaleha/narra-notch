import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { AgentStatus } from "./types";
import { playMochiPoke } from "../../lib/agentSound";
import { onGlobalCursor } from "../../platform/native";

interface MochiPetProps {
  status?: AgentStatus;
  mode?: "compact" | "full";
  trackCursor?: boolean;
  className?: string;
  showBadge?: boolean;
  showGreeting?: boolean;
}

export function MochiPet({
  status = "idle",
  mode = "compact",
  trackCursor = true,
  className = "",
  showBadge = true,
  showGreeting = false,
}: MochiPetProps) {
  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 });
  const [isBlinking, setIsBlinking] = useState(false);
  const [isPoked, setIsPoked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Natural periodic blinking
  useEffect(() => {
    let blinkTimer: number;

    const runBlink = () => {
      setIsBlinking(true);
      window.setTimeout(() => setIsBlinking(false), 140);
      const nextTime = 2800 + Math.random() * 3400;
      blinkTimer = window.setTimeout(runBlink, nextTime);
    };

    blinkTimer = window.setTimeout(runBlink, 3000);
    return () => window.clearTimeout(blinkTimer);
  }, []);

  // Track cursor position smoothly (local & global desktop)
  useEffect(() => {
    if (!trackCursor) {
      setPupilOffset({ x: 0, y: 0 });
      return;
    }

    const updateOffset = (clientX: number, clientY: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const maxOffset = mode === "compact" ? 2.0 : 4.0;
      const factor = Math.min(dist / 240, 1);

      if (dist > 0) {
        setPupilOffset({
          x: (dx / dist) * maxOffset * factor,
          y: (dy / dist) * maxOffset * factor,
        });
      }
    };

    const handlePointerMove = (e: MouseEvent) => {
      updateOffset(e.clientX, e.clientY);
    };

    window.addEventListener("mousemove", handlePointerMove);
    const offGlobal = onGlobalCursor((x, y) => {
      updateOffset(x, y);
    });

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      offGlobal();
    };
  }, [trackCursor, mode]);

  const handlePoke = () => {
    setIsPoked(true);
    playMochiPoke();
    window.setTimeout(() => setIsPoked(false), 300);
  };

  const isThinking = status === "thinking";
  const isApproval = status === "waiting_approval";

  // Compact mode for closed Notch pill (height ~20px)
  if (mode === "compact") {
    return (
      <div
        ref={containerRef}
        className={`relative flex items-center justify-center select-none ${className}`}
        style={{ width: 28, height: 20 }}
      >
        {/* Soft squircle head */}
        <div className="absolute inset-0 rounded-[9px] bg-gradient-to-b from-white via-[#f0f4f8] to-[#d4e4f2] shadow-sm" />

        {/* Vertical pill eyes */}
        <div className="relative flex items-center gap-[4.5px] z-10">
          <EyeItem
            isBlinking={isBlinking}
            isThinking={isThinking}
            isApproval={isApproval}
            pupilOffset={pupilOffset}
            w={2.8}
            h={5.5}
          />
          <EyeItem
            isBlinking={isBlinking}
            isThinking={isThinking}
            isApproval={isApproval}
            pupilOffset={pupilOffset}
            w={2.8}
            h={5.5}
          />
        </div>

        {/* Tiny thought bubble */}
        {showBadge && isThinking && (
          <div className="absolute -top-1 -left-1 flex h-3 w-3 items-center justify-center rounded-full bg-[#1c74e9] text-white shadow-xs">
            <span className="text-[7px] font-bold leading-none -mt-0.5">…</span>
          </div>
        )}
      </div>
    );
  }

  // Full mode exactly matching Coucou screenshot: 78x62 rounded white pebble head with blue badge
  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center select-none cursor-pointer ${className}`}
      style={{ width: 84, height: 68 }}
      onClick={handlePoke}
      title="narra mascot"
    >
      {/* Speech Bubble: "Coucou !" greeting */}
      <AnimatePresence>
        {showGreeting && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.85 }}
            animate={{ opacity: 1, y: -4, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            className="absolute -top-6 left-1/2 -translate-x-1/2 z-30 px-2 py-0.5 rounded-full bg-white text-zinc-950 text-[10px] font-extrabold shadow-md tracking-tight whitespace-nowrap border border-zinc-200"
          >
            Coucou ! 👋
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Head: Squircle with pure white to soft pale-blue gradient */}
      <motion.div
        className="relative flex items-center justify-center rounded-[24px] bg-gradient-to-b from-white via-[#f3f7fb] to-[#cde2f5] shadow-[0_4px_18px_rgba(0,0,0,0.4)] border border-white/80"
        style={{ width: 76, height: 60 }}
        animate={
          isPoked
            ? { scale: [1, 0.88, 1.08, 1], y: [0, 2, -4, 0] }
            : isApproval
            ? { y: [0, -3, 0], scale: [1, 1.03, 1] }
            : isThinking
            ? { y: [0, -1.5, 0] }
            : { y: [0, -1, 0] }
        }
        transition={{
          repeat: isPoked ? 0 : Infinity,
          duration: isPoked ? 0.3 : isApproval ? 1.4 : 3,
          ease: "easeInOut",
        }}
      >
        {/* Badge: Blue Speech Bubble with '...' exactly as in Coucou */}
        {showBadge && (
          <motion.div
            className="absolute -top-1.5 -left-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#1c74e9] text-white shadow-[0_2px_8px_rgba(28,116,233,0.5)] border-2 border-[#0d0f12] z-20"
            initial={{ scale: 0.8 }}
            animate={{ scale: isThinking ? [1, 1.15, 1] : 1 }}
            transition={{ repeat: Infinity, duration: 1.8 }}
          >
            <span className="text-[10px] font-bold tracking-tight leading-none -mt-1">
              …
            </span>
          </motion.div>
        )}

        {/* Pair of vertical pill eyes */}
        <div className="relative flex items-center gap-[15px]">
          <EyeItem
            isBlinking={isBlinking}
            isThinking={isThinking}
            isApproval={isApproval}
            pupilOffset={pupilOffset}
            w={6.5}
            h={13.5}
          />
          <EyeItem
            isBlinking={isBlinking}
            isThinking={isThinking}
            isApproval={isApproval}
            pupilOffset={pupilOffset}
            w={6.5}
            h={13.5}
          />
        </div>
      </motion.div>
    </div>
  );
}

interface EyeItemProps {
  isBlinking: boolean;
  isThinking: boolean;
  isApproval: boolean;
  pupilOffset: { x: number; y: number };
  w: number;
  h: number;
}

function EyeItem({
  isBlinking,
  isThinking,
  isApproval,
  pupilOffset,
  w,
  h,
}: EyeItemProps) {
  const effectiveOffset = isThinking
    ? { x: pupilOffset.x * 0.4, y: -h * 0.2 }
    : pupilOffset;

  return (
    <div
      className="relative flex items-center justify-center rounded-full bg-[#0a0a0c] overflow-hidden transition-transform"
      style={{
        width: w,
        height: h,
        transform: isBlinking
          ? "scaleY(0.08)"
          : isApproval
          ? "scale(1.2)"
          : "scale(1)",
        transition: "transform 0.12s ease-out",
      }}
    >
      {/* Pupil with subtle catchlight highlight */}
      <div
        className="absolute rounded-full bg-[#18181c]"
        style={{
          width: w * 0.85,
          height: h * 0.65,
          transform: `translate(${effectiveOffset.x}px, ${effectiveOffset.y}px)`,
        }}
      >
        <div
          className="absolute rounded-full bg-white/70"
          style={{
            width: w * 0.35,
            height: w * 0.35,
            top: 1,
            right: 1,
          }}
        />
      </div>
    </div>
  );
}
