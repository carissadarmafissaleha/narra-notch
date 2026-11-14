import { useCallback, useEffect, useRef, useState } from "react";
import { createStore } from "../lib/store";
import { setPinned, isNative } from "../platform/native";
import { hoverDelayMs, settings } from "../settings/store";
import { waterAlertStore, isWaterAlertBlocking } from "../features/water/store";
import { prayerStore, isPrayerAlertBlocking } from "../features/prayer/store";
import { hudStore } from "../features/hud/store";
import { agentStore } from "../features/agent/store";

export type NotchStatus = "closed" | "peek" | "open";

/** Delays in ms. The hover delay comes from the settings. */
export const timing = {
  /** Grace period on leave, so slipping off briefly doesn't close it. */
  leaveClose: 180,
};

/*
 * "Hold": while dragging (seeking, drag and drop) the notch stays open and
 * clickable even if the cursor leaves briefly. A counter, so several places
 * can hold at once.
 */
const holds = createStore(0);

export function holdOpen(on: boolean) {
  holds.set((n) => Math.max(0, n + (on ? 1 : -1)));
  setPinned(holds.get() > 0);
}

/*
 * Pin (top right): the notch stays open even when the cursor leaves or another
 * app takes focus, e.g. to drag files from Explorer or copy a key from the
 * browser. Unlike `holdOpen`, the window stays click-through outside the notch.
 * Esc / the shortcut close and unpin it.
 */
export const pinned = createStore(false);

export function togglePin() {
  pinned.set((p) => !p);
}

/**
 * Notch state machine:
 *
 *   closed ──hover──▶ peek ──hover held / click──▶ open
 *     ▲                 │                               │
 *     └────leave────┘◀──leave (grace) / Esc / click outside
 *
 *   Shortcut: closed ⇄ open directly, no peek and no delay.
 *   While typing, holding or pinned, leaving doesn't close.
 *
 *   close()   close on purpose (Esc, shortcut), also unpins.
 *   dismiss() close casually (click outside, focus loss), not when pinned.
 */
export function useNotchState() {
  const isMobileDevice =
    !isNative &&
    typeof window !== "undefined" &&
    (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      window.innerWidth <= 768 ||
      new URLSearchParams(window.location.search).has("mobile"));
  const isShowcase = typeof location !== "undefined" && new URLSearchParams(location.search).has("showcase");
  const initialOpen = (isShowcase || isMobileDevice) && !new URLSearchParams(location.search).has("closed");
  const [status, setStatusState] = useState<NotchStatus>(initialOpen ? "open" : "closed");
  const statusRef = useRef<NotchStatus>(initialOpen ? "open" : "closed");
  const hovering = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const setStatus = useCallback((s: NotchStatus) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  const later = useCallback(
    (ms: number, s: NotchStatus) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setStatus(s), ms);
    },
    [setStatus],
  );

  const open = useCallback(() => {
    window.clearTimeout(timer.current);
    setStatus("open");
  }, [setStatus]);

  const close = useCallback(() => {
    if (isMobileDevice) return;
    window.clearTimeout(timer.current);
    pinned.set(false);
    setStatus("closed");
  }, [setStatus, isMobileDevice]);

  const dismiss = useCallback(() => {
    if (isMobileDevice) return;
    // Held (dragging, Windows Hello dialog in front) counts like pinned.
    if (pinned.get() || holds.get() > 0) return;
    window.clearTimeout(timer.current);
    setStatus("closed");
  }, [setStatus, isMobileDevice]);

  /** For the shortcut: open/close directly without peek. Returns the new state. */
  const toggle = useCallback((): NotchStatus => {
    if (statusRef.current === "open") {
      close();
      return "closed";
    }
    open();
    return "open";
  }, [open, close]);

  const onPointerEnter = useCallback(() => {
    hovering.current = true;
    window.clearTimeout(timer.current);
    // Keep the notch closed when an interactive water/prayer alert or HUD popup is active,
    // so hovering over the pill to click "Drank", "Snooze", or "Laksanakan" never opens the full page over it.
    if (isWaterAlertBlocking() || isPrayerAlertBlocking() || hudStore.get().active) return;
    if (statusRef.current === "closed") {
      setStatus("peek");
      // "Click" mode: only nudge, open on click.
      const s = settings.get();
      if (s.openMode === "hover") later(hoverDelayMs[s.hoverDelay], "open");
    }
  }, [setStatus, later]);

  // Collapse the notch immediately when a water/prayer alert or HUD popup triggers,
  // so the closed-notch banner is always visible and never hidden behind an open page.
  useEffect(() => {
    const offWater = waterAlertStore.subscribe(() => {
      if (waterAlertStore.get().active) {
        window.clearTimeout(timer.current);
        pinned.set(false);
        setStatus("closed");
      }
    });
    const offPrayer = prayerStore.subscribe(() => {
      if (prayerStore.get().activeAlert !== null) {
        window.clearTimeout(timer.current);
        pinned.set(false);
        setStatus("closed");
      }
    });
    const offHud = hudStore.subscribe(() => {
      if (hudStore.get().active && statusRef.current !== "open") {
        window.clearTimeout(timer.current);
        pinned.set(false);
        setStatus("closed");
      }
    });
    return () => {
      offWater();
      offPrayer();
      offHud();
    };
  }, [setStatus]);

  const onPointerLeave = useCallback(() => {
    hovering.current = false;
    window.clearTimeout(timer.current);
    if (statusRef.current === "peek") setStatus("closed");
    else if (statusRef.current === "open" && mayAutoClose()) later(timing.leaveClose, "closed");
  }, [setStatus, later]);

  // Hold ended and the cursor is outside → handle the missed leave now.
  useEffect(
    () =>
      holds.subscribe(() => {
        if (!hovering.current && statusRef.current === "open" && mayAutoClose()) {
          later(timing.leaveClose, "closed");
        }
      }),
    [later],
  );

  // Unpinned and the cursor is outside → close now.
  useEffect(
    () =>
      pinned.subscribe(() => {
        if (!pinned.get() && !hovering.current && statusRef.current === "open" && mayAutoClose()) later(timing.leaveClose, "closed");
      }),
    [later],
  );

  // Esc closes directly.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer.current);
    };
  }, [close]);

  return { status, open, close, dismiss, toggle, onPointerEnter, onPointerLeave };
}

function mayAutoClose(): boolean {
  if (agentStore.get().pendingApproval !== null || agentStore.get().status === 'waiting_approval') return false;
  return !pinned.get() && holds.get() === 0 && !isEditing();
}

function isEditing(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}
