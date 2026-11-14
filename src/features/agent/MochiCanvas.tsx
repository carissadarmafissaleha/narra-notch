import { useEffect, useRef } from "react";
import { BotEngine, hexToRGB, type RGB } from "./coucou/engine";
import type { BotStateName } from "./coucou/types";
import type { Outfit } from "./coucou/wardrobe";
import { onGlobalCursor } from "../../platform/native";
import { Sound } from "./coucou/soundAdapter";

interface MochiCanvasProps {
  state?: BotStateName;
  outfit?: Outfit;
  bodyColor?: RGB | string | null;
  size?: number; // Logical diameter (e.g., 58 for expanded, 20 for closed)
  trackCursor?: boolean;
  glow?: boolean;
  className?: string;
  onClick?: () => void;
  wave?: boolean;
  onEngineReady?: (engine: BotEngine) => void;
  onDizzy?: () => void;
}

export function MochiCanvas({
  state = "idle",
  outfit = "none",
  bodyColor = null, // Default pure Coucou white pearl
  size = 58,
  trackCursor = true,
  glow = false,
  className = "",
  onClick,
  wave = false,
  onEngineReady,
  onDizzy,
}: MochiCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<BotEngine | null>(null);

  if (!engineRef.current) {
    engineRef.current = new BotEngine();
  }
  const engine = engineRef.current;

  // Fire onEngineReady exactly once per engine instance. Previously an inline
  // callback re-fired on every parent render, replaying the greeting sound dozens
  // of times (the "double/overlapping Mochi sound" bug).
  const onReadyRef = useRef(onEngineReady);
  useEffect(() => {
    onReadyRef.current = onEngineReady;
  }, [onEngineReady]);

  useEffect(() => {
    onReadyRef.current?.(engine);
  }, [engine]);

  useEffect(() => {
    engine.onDizzy = onDizzy ?? null;
  }, [engine, onDizzy]);

  // Resolve body color RGB
  const rgb: RGB | null =
    typeof bodyColor === "string" ? hexToRGB(bodyColor) : bodyColor ?? null;

  // Sync state & outfit & color
  useEffect(() => {
    engine.setState(state);
  }, [state, engine]);

  useEffect(() => {
    engine.bodyColor = rgb;
  }, [rgb, engine]);

  useEffect(() => {
    engine.setOutfit(outfit, false);
  }, [outfit, engine]);

  useEffect(() => {
    if (wave) {
      engine.greet();
    }
  }, [wave, engine]);

  // Frame loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId: number;
    let lastTime = performance.now();

    const render = (nowMs: number) => {
      // Skip render when hidden (display: none) to save CPU/GPU cycles
      if (!canvas.offsetParent && canvas.offsetWidth === 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      const dt = Math.min((nowMs - lastTime) / 1000, 0.1);
      lastTime = nowMs;

      const isSmall = size <= 32;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(size / 0.6));
      const BOT_OVERHANG = isSmall ? 8 : 32;
      const BOT_SIDE = isSmall ? 8 : 26;
      const hCss = w + BOT_OVERHANG;
      const wCss = w + BOT_SIDE * 2;

      const targetW = Math.round(wCss * dpr);
      const targetH = Math.round(hCss * dpr);

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      engine.particleOverhang = BOT_OVERHANG;
      engine.update(dt);

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Vertical center correction: compensate for particleOverhang/2 in engine.draw
        const yOffset = -(BOT_OVERHANG / 2) * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, BOT_SIDE * dpr, yOffset);
        ctx.save();
        engine.applyDance(ctx, w, hCss);
        engine.draw(ctx, w, hCss);
        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [size, engine]);

  // Pointer tracking (local window & global Windows desktop cursor)
  useEffect(() => {
    if (!trackCursor) {
      engine.lookX = 0;
      engine.lookY = 0;
      return;
    }

    const updateLook = (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const botScreenX = rect.left + rect.width / 2;
      const botScreenY = rect.top + rect.height / 2;
      engine.lookX = Math.tanh((clientX - botScreenX) / 240);
      engine.lookY = -Math.tanh((clientY - botScreenY) / 240); // Invert pitch: Coucou +pitch looks up, screen +Y is down
    };

    const handlePointerMove = (e: MouseEvent) => {
      updateLook(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 0) {
        updateLook(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchstart", handleTouchMove, { passive: true });
    const offGlobal = onGlobalCursor((x, y) => {
      updateLook(x, y);
    });

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchstart", handleTouchMove);
      offGlobal();
    };
  }, [trackCursor, engine]);

  const lastTapRef = useRef(0);
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handlePointerDown = (clientX: number, clientY: number) => {
    pointerStartRef.current = { x: clientX, y: clientY, time: Date.now() };
  };

  const handlePointerUp = (clientX: number, clientY: number) => {
    if (!pointerStartRef.current) return;
    const dx = clientX - pointerStartRef.current.x;
    const dy = clientY - pointerStartRef.current.y;
    const dt = Date.now() - pointerStartRef.current.time;
    pointerStartRef.current = null;

    const dist = Math.hypot(dx, dy);

    // If gesture moved > 28px in < 650ms, handle as SWIPE
    if (dist > 28 && dt < 650) {
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe: Roll somersault in swipe direction!
        const dir = dx > 0 ? 1 : -1;
        engine.doRoll(850, dir);
        Sound.play("pop");
      } else if (dy < 0) {
        // Swipe UP: Jump high with stars!
        engine.jump(3.0);
      } else {
        // Swipe DOWN: Duck & squash / swallow!
        engine.gulp();
        Sound.play("blip");
      }
      return;
    }

    // Otherwise it's a TAP
    handleTap();
  };

  const handleTap = () => {
    const now = Date.now();
    const dt = now - lastTapRef.current;
    lastTapRef.current = now;

    // Rapid tapping within 1.8s triggers slap escalation (annoyed -> dizzy -> angry)
    if (dt < 1800 && dt > 40) {
      engine.slap();
    } else {
      // Single gentle tap: Random playful reaction!
      const rand = Math.random();
      if (rand < 0.28) {
        engine.greet();
      } else if (rand < 0.52) {
        engine.triggerEmote("love", 2.2);
        Sound.play("love");
      } else if (rand < 0.74) {
        engine.triggerEmote("proud", 2.2);
        Sound.play("proud");
      } else if (rand < 0.88) {
        engine.triggerEmote("wink", 1.8);
        Sound.play("wink");
      } else {
        engine.doRoll(800, 1);
        Sound.play("pop");
      }
    }
    onClick?.();
  };

  const isSmall = size <= 32;
  const containerW = isSmall ? Math.round(size * 1.35) : Math.round(size * 1.45);
  const containerH = isSmall ? 30 : Math.round(size * 1.35);
  const canvasW = isSmall ? Math.round(size * 1.4) : Math.round(size * 1.55);
  const canvasH = isSmall ? Math.round(size * 1.25) : Math.round(size * 1.4);

  return (
    <div
      className={`relative flex items-center justify-center select-none cursor-pointer ${className}`}
      style={{
        width: containerW,
        height: containerH,
        touchAction: "none",
        WebkitTapHighlightColor: "transparent",
      }}
      onPointerDown={(e) => {
        handlePointerDown(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        handlePointerUp(e.clientX, e.clientY);
      }}
    >
      <canvas
        ref={canvasRef}
        className={`relative pointer-events-none block shrink-0${glow ? " mochi-glow" : ""}`}
        style={{
          width: canvasW,
          height: canvasH,
          zIndex: 1,
          filter: glow ? "drop-shadow(0 0 10px rgba(56, 189, 248, 0.7))" : undefined,
        }}
      />
    </div>
  );
}
