import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion, type Transition } from "motion/react";
import { GearSix, PushPin, Selection } from "@phosphor-icons/react";
import { content, springs } from "../design/motion";
import { useNowPlaying } from "../platform/media";
import { isNative, keyboardFocus, onNativeBlur, onNativeHover, onShortcut, onTrayOpen, setHitRect, setMemoryLow } from "../platform/native";
import { PrivacyDots } from "../features/privacy/PrivacyDots";
import { FOCUS_CLICKS, focusMode, setFocusMode } from "./focus";
import { useDragToMove } from "./drag";
import { LiveSlot, useLiveActivity } from "./live";
import { LiveHud } from "../features/hud/LiveHud";
import { LiveWater } from "../features/water/LiveWater";
import { LivePrayer } from "../features/prayer/LivePrayer";
import { LiveAgent, useAgentApproval } from "../features/agent/LiveAgent";
import { useLyricsInPillActive } from "../features/lyrics/store";
import { HEADER_HEIGHT, geometry, openGeometry, type NotchGeometry } from "./geometry";
import { HeaderButton, headerSlot } from "./header";
import { sizeOverride } from "./size";
import { NotchShape } from "./NotchShape";
import { drop } from "../platform/drop";
import { settings } from "../settings/store";
import { themeTint } from "../lib/theme";
import { useUnseen } from "../lib/changelog";
import { nav, navigate } from "./nav";
import { update } from "../lib/update";
import { findTab, settingsTab, tabs, type NotchTab } from "./tabs";
import { holdOpen, pinned, togglePin, useNotchState, type NotchStatus } from "./useNotchState";
import { t } from "../i18n";
import { timer } from "../features/timer/store";
import { isWaterAlertBlocking } from "../features/water/store";
import { isPrayerAlertBlocking } from "../features/prayer/store";
import { hudStore } from "../features/hud/store";

/** If the notch was closed at most this long, it reopens on the last used tool. */
const RESUME_MS = 60_000;
/** Closed this long → lower WebView2's memory target. */
const MEMORY_LOW_AFTER_MS = 20_000;

export function Notch() {
  const { status, open, close, dismiss, toggle, onPointerEnter, onPointerLeave } = useNotchState();
  const focus = focusMode.use();
  const allSettings = settings.use();
  const { tools: toolSettings, display: displaySettings } = allSettings;
  const tint = themeTint(allSettings);
  // Focus mode as a line: no live activity, no dots, only the thin strip at the edge.
  const line = focus && displaySettings.focusStyle === "line";
  const timerDone = timer.use().finished;
  const idleLine = !focus && displaySettings.idleStyle === "line";
  const visible = toolSettings.filter((t) => t.enabled).map((t) => findTab(t.id)).filter((t): t is NotchTab => !!t);
  const { tabId } = nav.use();
  // Hidden tool active (e.g. just disabled) → first visible one.
  const tab = tabId === settingsTab.id ? settingsTab : (visible.find((t) => t.id === tabId) ?? visible[0] ?? tabs[0]);
  const np = useNowPlaying();
  const live = useLiveActivity();
  const lyricsInPill = useLyricsInPillActive(np);
  const lastOpenTool = useRef<string>(tabId !== settingsTab.id ? tabId : "overview");
  if (tabId !== settingsTab.id) lastOpenTool.current = tabId;

  // Like the Dynamic Island: opening jumps to the running activity's tool,
  // but only after a pause. Closed briefly (copying a key, grabbing a file) → you
  // land where you were, e.g. in the settings.
  // Layout effect runs before paint → no frame with the old tab size.
  const prevStatus = useRef(status);
  const closedAt = useRef(0);
  // A target tool from the tray (settings entry) takes priority over the live activity.
  const trayTab = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (status === "open" && prevStatus.current !== "open") {
      const resumed = Date.now() - closedAt.current < RESUME_MS;
      const targetLive = live.id === "media-lyrics" ? "media" : live.id;
      if (trayTab.current) navigate(trayTab.current);
      else if (!resumed && targetLive && visible.some((t) => t.id === targetLive)) navigate(targetLive);
      trayTab.current = null;
    }
    if (status !== "open" && prevStatus.current === "open") {
      closedAt.current = Date.now();
      if (nav.get().tabId === settingsTab.id) {
        navigate(lastOpenTool.current ?? "overview");
      }
    }
    prevStatus.current = status;
  });

  useQuickDrop(status, open, dismiss);

  const override = sizeOverride.use();
  const baseSize = override?.tabId === tab.id ? override : tab.size;
  const isMobile =
    typeof window !== "undefined" &&
    (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      window.innerWidth <= 768 ||
      new URLSearchParams(window.location.search).has("mobile"));
  const baseScale = displaySettings.scale ?? 1.0;
  const notchScale = isMobile
    ? Math.min(1.0, (window.innerWidth - 8) / baseSize.w)
    : baseScale;
  const size = {
    w: Math.round(baseSize.w * notchScale),
    h: Math.round(baseSize.h * notchScale),
  };

  // In line mode, dynamic popups, alerts, and live synced lyrics still expand into the notch pill:
  const isLineExpanded =
    live.id === "hud" ||
    live.id === "water" ||
    live.id === "prayer" ||
    live.id === "media-lyrics" ||
    (live.id === "agent" && lyricsInPill) ||
    (live.id === "timer" && timerDone);

  const shownLive = (line || idleLine) ? (isLineExpanded ? live.id : null) : live.id;
  const isLineActive = (line || idleLine) && !isLineExpanded;

  const agentApproval = useAgentApproval();
  const isNotificationAlert =
    shownLive === "hud" ||
    shownLive === "water" ||
    shownLive === "prayer" ||
    (shownLive === "agent" && Boolean(agentApproval));

  const alertBox =
    shownLive === "hud"
      ? geometry.hud
      : geometry.waterAlert;

  const shape =
    isLineActive && status === "closed"
      ? geometry.line
      : isLineActive && status === "peek"
        ? geometry.linePeek
        : shapeFor(status, shownLive, size, lyricsInPill);
  const tightHit = shape === geometry.line || shape === geometry.linePeek;
  const sticky = useStickyHitZone(status, size.h);
  const transition = useTransitionFor(status, shape);

  // Click outside closes (in the browser the fake desktop, in Tauri the window blur).
  const hitRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!hitRef.current?.contains(e.target as Node)) dismiss();
    };
    window.addEventListener("pointerdown", onDown);
    const offBlur = onNativeBlur(dismiss);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      offBlur();
    };
  }, [dismiss]);

  useNativeBridge(hitRef, onPointerEnter, onPointerLeave);
  const drag = useDragToMove(status);

  // Focus mode on → notch closes, no more hover.
  useEffect(() => {
    if (focus) close();
  }, [focus, close]);

  // Three quick clicks only leave focus mode (natively Rust counts them while the
  // window is click-through). Focus mode is entered from the header, settings, or tray.
  const onClick = (e: React.MouseEvent) => {
    if (drag.moved()) return;
    if (isInteractive(e.target)) return;
    if (isWaterAlertBlocking() || isPrayerAlertBlocking() || hudStore.get().active) return;
    if (e.detail >= FOCUS_CLICKS) {
      if (focus) setFocusMode(false);
      return;
    }
    if (!focus && status !== "open") open();
  };

  // Shortcut: opening takes focus (Esc, typing), closing gives it back.
  useEffect(() => onShortcut(() => toggle() === "open" && keyboardFocus(true)), [toggle]);
  useEffect(
    () =>
      onTrayOpen((tab) => {
        // Only remember it while opening, otherwise it would stick for the next open.
        trayTab.current = status === "open" ? null : tab;
        if (tab) navigate(tab);
        open();
        keyboardFocus(true);
      }),
    [open, status],
  );
  useEffect(() => {
    const onCustomOpen = (e: Event) => {
      const tab = (e as CustomEvent<{ tab?: string }>)?.detail?.tab;
      trayTab.current = status === "open" ? null : tab ?? null;
      if (tab) navigate(tab);
      open();
      keyboardFocus(true);
    };
    window.addEventListener("notch:open", onCustomOpen);
    return () => window.removeEventListener("notch:open", onCustomOpen);
  }, [open, status]);
  useEffect(() => {
    if (status === "closed") keyboardFocus(false);
  }, [status]);

  // Closed for a while → WebView2 may trim memory; back to normal on the first touch
  // (peek), so the hover delay covers paging it back in before the notch opens.
  useEffect(() => {
    if (status !== "closed") return setMemoryLow(false);
    const id = window.setTimeout(() => setMemoryLow(true), MEMORY_LOW_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [status]);

  // 1–9 switches tools while open and not typing.
  useEffect(() => {
    if (status !== "open") return;
    const onKey = (e: KeyboardEvent) => {
      if (isTextField(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
      const tab = visible[Number(e.key) - 1];
      if (tab) navigate(tab.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, visible]);

  return (
    <div
      data-notch-root
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{
        ["--accent" as string]: np?.accent,
        ["--tint" as string]: tint,
        opacity: focus && !line ? 0.5 : 1,
        transform: isNative ? undefined : (isMobile ? undefined : `translateX(${drag.offset}px)`),
        paddingTop: isMobile ? "max(env(safe-area-inset-top), 8px)" : undefined,
      }}
    >
      {/* Hit zone: bigger than the visible shape (Fitts) and flush with the top edge. */}
      <div
        ref={hitRef}
        data-notch-hit
        // The line is meant to stay out of the way: only a hair of extra hit zone, so
        // the cursor has to be on it (the normal notch gets the generous Fitts margin).
        className={`pointer-events-auto ${tightHit ? "px-1 pb-1" : "px-4 pb-3"}`}
        style={{ minHeight: sticky.minHeight, cursor: drag.dragging ? "grabbing" : undefined }}
        onPointerMove={sticky.onPointerMove}
        onPointerDown={focus ? undefined : drag.onPointerDown}
        // In Tauri, hover comes from the Rust poll (useNativeBridge), not the DOM.
        onPointerEnter={isNative || focus ? undefined : onPointerEnter}
        onPointerLeave={isNative || focus ? undefined : onPointerLeave}
        onClick={onClick}
      >
        <NotchShape geometry={shape} transition={transition} elevated={status === "open"}>
          <LiveSlot id={status === "open" ? null : shownLive} />
          {!line && !idleLine && (status === "open" || (shownLive !== "water" && shownLive !== "prayer" && shownLive !== "hud" && shownLive !== "media-lyrics" && !(shownLive === "agent" && lyricsInPill))) && <PrivacyDots />}

          {/* Floating Notification Pill when Notch is Open / Pinned */}
          <AnimatePresence>
            {status === "open" && isNotificationAlert && (
              <motion.div
                key={`open-alert-${shownLive}`}
                className="absolute top-2.5 left-1/2 -translate-x-1/2 z-50 pointer-events-auto rounded-full bg-[#0d0e12]/95 border border-white/20 shadow-[0_12px_36px_rgba(0,0,0,0.85)] backdrop-blur-2xl overflow-hidden"
                style={{
                  width: alertBox.w,
                  height: alertBox.h,
                }}
                initial={{ opacity: 0, y: -18, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", damping: 22, stiffness: 300 } }}
                exit={{ opacity: 0, y: -14, scale: 0.94, transition: { duration: 0.14 } }}
              >
                {shownLive === "hud" && <LiveHud />}
                {shownLive === "water" && <LiveWater />}
                {shownLive === "prayer" && <LivePrayer />}
                {shownLive === "agent" && <LiveAgent />}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {status === "open" && (
              <motion.div
                key="open"
                className="absolute top-0 left-1/2 overflow-hidden"
                style={{ width: size.w, height: size.h, marginLeft: -size.w / 2 }}
                initial={{ opacity: 0, transform: "translateY(-6px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)", transition: content.enter }}
                exit={{ opacity: 0, transform: "translateY(-4px)", transition: content.exit }}
              >
                <div
                  className="flex flex-col overflow-hidden shrink-0"
                  style={{
                    width: baseSize.w,
                    height: baseSize.h,
                    ...(notchScale !== 1
                      ? {
                          transform: `scale(${notchScale})`,
                          transformOrigin: "top left",
                        }
                      : {}),
                  }}
                >
                  <TopNavBar tabs={visible} activeId={tab.id} onDragStart={drag.onPointerDown} />
                  <Header title={t(tab.label)} onDragStart={drag.onPointerDown} />
                  <div className="relative min-h-0 flex-1 overflow-clip">
                    {/* Crossfade: old tool leaves quickly while the new one lifts in (no wait gap). */}
                    <AnimatePresence initial={false}>
                      <motion.div
                        key={tab.id}
                        className="absolute inset-0"
                        initial={{ opacity: 0, y: 8, scale: 0.985, filter: "blur(4px)" }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          filter: "blur(0px)",
                          transition: { duration: 0.32, delay: 0.04, ease: [0.23, 1, 0.32, 1] },
                        }}
                        exit={{
                          opacity: 0,
                          y: -4,
                          scale: 0.99,
                          filter: "blur(3px)",
                          transition: { duration: 0.14, ease: [0.4, 0, 1, 1] },
                        }}
                      >
                        <tab.View />
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </NotchShape>
      </div>
    </div>
  );
}

function formatHeaderTitle(title: string): ReactNode {
  const parts = title.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (
      <>
        <span className="italic font-normal">{parts[0]}</span>{" "}
        <span className="font-bold text-tint transition-colors duration-300">{parts.slice(1).join(" ")}</span>
      </>
    );
  }
  return <span className="font-bold text-tint transition-colors duration-300">{title}</span>;
}


/** Top navigation bar: tool icons situated above the title header. */
function TopNavBar({
  tabs,
  activeId,
  onDragStart,
}: {
  tabs: NotchTab[];
  activeId: string;
  onDragStart: (e: React.PointerEvent) => void;
}) {
  const lastTool = useRef(tabs[0]?.id);
  if (activeId !== settingsTab.id) lastTool.current = activeId;
  const inSettings = activeId === settingsTab.id;
  const updateReady = update.use().phase === "available";
  const unseen = useUnseen().length > 0;
  const badge = updateReady || unseen;
  const lastWheelTime = useRef(0);

  const onWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - lastWheelTime.current < 160) return;
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(delta) < 8) return;
    lastWheelTime.current = now;

    const allTabs = [...tabs, settingsTab];
    const currentIndex = allTabs.findIndex((t) => t.id === activeId);
    if (currentIndex === -1) return;

    if (delta > 0) {
      const nextIndex = (currentIndex + 1) % allTabs.length;
      navigate(allTabs[nextIndex].id);
    } else {
      const prevIndex = (currentIndex - 1 + allTabs.length) % allTabs.length;
      navigate(allTabs[prevIndex].id);
    }
  };

  return (
    <div
      data-drag-handle
      onPointerDown={onDragStart}
      className="flex shrink-0 items-center justify-center pt-2 pb-0.5 px-4 select-none"
    >
      <div
        className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]"
        onWheel={onWheel}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {tabs.map((tab) => (
          <NavTabButton
            key={tab.id}
            label={t(tab.label)}
            icon={tab.icon}
            active={tab.id === activeId}
            onClick={() => navigate(tab.id)}
          />
        ))}
        <span aria-hidden className="mx-1 h-3.5 w-px bg-white/10 shrink-0" />
        <NavTabButton
          label={t(settingsTab.label)}
          icon={GearSix}
          active={inSettings}
          badge={badge}
          onClick={() =>
            inSettings
              ? navigate(lastTool.current ?? tabs[0]?.id ?? "overview")
              : navigate(settingsTab.id, badge ? "updates" : null)
          }
        />
      </div>
    </div>
  );
}

function NavTabButton(props: {
  label: string;
  icon: NotchTab["icon"];
  active: boolean;
  onClick: () => void;
  badge?: boolean;
}) {
  const I = props.icon;
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className={`pressable relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
        props.active
          ? "text-white bg-white/10"
          : "text-white/40 hover:text-white/80 hover:bg-white/[0.05]"
      }`}
    >
      {props.active && (
        <motion.span
          layoutId="top-nav-dot"
          className="absolute -bottom-0.5 h-[3px] w-3.5 rounded-full bg-white shadow-sm"
          transition={springs.snappy}
        />
      )}
      <I size={16} weight={props.active ? "fill" : "bold"} className="relative" />
      {/* Badge dot (e.g. update available) at the icon's top right. */}
      <AnimatePresence>
        {props.badge && (
          <motion.span
            className="absolute top-1 right-1 size-[6px] rounded-full bg-link ring-2 ring-notch"
            initial={{ opacity: 0, transform: "scale(0.9)" }}
            animate={{ opacity: 1, transform: "scale(1)" }}
            exit={{ opacity: 0, transform: "scale(0.9)" }}
            transition={springs.snappy}
          />
        )}
      </AnimatePresence>
    </button>
  );
}

/** Header: tool title on the left, actions + resize + focus + pin on the right. Directly below the TopNavBar. */
function Header({
  title,
  onDragStart,
}: {
  title: string;
  onDragStart: (e: React.PointerEvent) => void;
}) {
  const isPinned = pinned.use();
  return (
    // Empty header space = drag handle.
    <div
      data-drag-handle
      onPointerDown={onDragStart}
      className="flex shrink-0 items-center justify-between gap-3 pr-3 pl-5"
      style={{ height: HEADER_HEIGHT }}
    >
      <div className="relative min-w-0 flex-1">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.h2
            key={title}
            className="truncate text-title font-semibold"
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0, transition: content.enter }}
            exit={{ opacity: 0, y: 2, transition: content.exit }}
          >
            {formatHeaderTitle(title)}
          </motion.h2>
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
        {/* Tools render here via <HeaderActions> (src/notch/header.tsx). The grid stacks old and new during a switch. */}
        <div ref={(el) => headerSlot.set(el)} className="grid" />
        <HeaderButton label={t("Fokus-Modus (3× klicken zum Beenden)")} onClick={() => setFocusMode(true)}>
          <Selection size={14} weight="bold" />
        </HeaderButton>
        <HeaderButton label={isPinned ? t("Lösen") : t("Offen halten")} active={isPinned} onClick={togglePin}>
          <PushPin size={14} weight={isPinned ? "fill" : "bold"} />
        </HeaderButton>
      </div>
    </div>
  );
}

/**
 * With the dock at the bottom, a shorter tool moves it up, so the cursor would
 * suddenly be outside and the notch would close. So the hit zone only shrinks
 * once the cursor is back over the shape (or the notch closes).
 * Applies natively too: Rust gets this zone's rectangle.
 */
function useStickyHitZone(status: NotchStatus, height: number) {
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined);
  const prev = useRef(height);
  useLayoutEffect(() => {
    if (status !== "open") setMinHeight(undefined);
    else if (height < prev.current) {
      const from = prev.current + HIT_PAD_BOTTOM;
      setMinHeight((m) => Math.max(m ?? 0, from));
    }
    prev.current = height;
  }, [status, height]);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (minHeight === undefined) return;
    const shapeBottom = e.currentTarget.getBoundingClientRect().top + height;
    if (e.clientY < shapeBottom) setMinHeight(undefined);
  };
  return { minHeight, onPointerMove };
}

/** pb-3 of the hit zone. */
const HIT_PAD_BOTTOM = 12;

function shapeFor(status: NotchStatus, live: string | null, size: { w: number; h: number }, lyricsInPill?: boolean): NotchGeometry {
  if (status === "open") return openGeometry(size.w, size.h);
  const base =
    live === "system"
      ? geometry.gaming
      : live === "water" || live === "prayer"
        ? geometry.waterAlert
        : live === "hud"
          ? geometry.hud
          : live === "media-lyrics" || (live === "agent" && lyricsInPill)
            ? geometry.liveLyrics
            : live
              ? geometry.live
              : geometry.closed;
  if (status === "peek") {
    // Hover nudge relative to the current width so it also fits the live state.
    const bump = geometry.peek.w - geometry.closed.w;
    return { ...geometry.peek, w: base.w + bump, h: Math.max(geometry.peek.h, base.h) };
  }
  return base;
}

/** Picks the spring for the transition (open ≠ close ≠ morph). */
function useTransitionFor(status: NotchStatus, shape: NotchGeometry): Transition {
  const prev = useRef(status);
  const key = `${shape.w}x${shape.h}`;
  const prevKey = useRef(key);

  let t: Transition;
  if (status === "open") t = prev.current === "open" ? springs.morph : springs.open;
  else if (status === "peek") t = springs.peek;
  else t = prev.current === "open" ? springs.close : springs.morph;

  // Only switch when the shape actually changes, otherwise the running spring continues.
  const stable = useRef(t);
  if (prevKey.current !== key) stable.current = t;

  useEffect(() => {
    prev.current = status;
    prevKey.current = key;
  });

  return stable.current;
}

/**
 * Quick drop: drag files over the notch and it opens on Shelf or Converter
 * (whichever was used last).
 * A cancelled drag closes it again if it only opened for that.
 */
function useQuickDrop(status: NotchStatus, open: () => void, dismiss: () => void) {
  const openedByDrag = useRef(false);
  // Drops land in the last used file tool (Shelf or Converter).
  const fileTool = useRef<"shelf" | "convert">("convert");
  useEffect(
    () =>
      nav.subscribe(() => {
        const id = nav.get().tabId;
        if (id === "shelf" || id === "convert") fileTool.current = id;
      }),
    [],
  );
  const holding = useRef(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(
    () =>
      drop.subscribe(() => {
        const { dragging, dropped } = drop.get();
        if (dragging && !holding.current) {
          holding.current = true;
          holdOpen(true);
          if (statusRef.current !== "open") {
            openedByDrag.current = true;
            open();
          }
          const current = nav.get().tabId;
          if (current !== "shelf" && current !== "convert") navigate(fileTool.current);
        } else if (!dragging && holding.current) {
          // Drag over: dropped → stay open, cancelled → close again.
          holding.current = false;
          holdOpen(false);
          if (!dropped && openedByDrag.current) dismiss();
          openedByDrag.current = false;
        }
      }),
    [open, dismiss],
  );
}

/**
 * Link to the native shell: reports the hit zone to Rust (click-through), receives
 * hover from the Rust poll and keeps the window clickable while typing.
 */
function useNativeBridge(
  hitRef: RefObject<HTMLDivElement | null>,
  onEnter: () => void,
  onLeave: () => void,
) {
  useEffect(() => {
    const el = hitRef.current;
    if (!isNative || !el) return;

    // The shape's size is animated by a spring → ResizeObserver fires every frame.
    const report = () => {
      const r = el.getBoundingClientRect();
      setHitRect({ x: r.x, y: r.y, w: r.width, h: r.height });
    };
    const ro = new ResizeObserver(report);
    ro.observe(el);
    report();

    const offHover = onNativeHover((inside) => (inside ? onEnter() : onLeave()));
    // Text field focused → hold (clickable, no collapse) until focus leaves.
    let typing = false;
    const onFocusIn = (e: FocusEvent) => {
      if (isTextField(e.target) && !typing) holdOpen((typing = true));
    };
    const onFocusOut = (e: FocusEvent) => {
      if (typing && !isTextField(e.relatedTarget)) holdOpen((typing = false));
    };
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);

    return () => {
      ro.disconnect();
      offHover();
      el.removeEventListener("focusin", onFocusIn);
      el.removeEventListener("focusout", onFocusOut);
      if (typing) holdOpen(false);
    };
  }, [hitRef, onEnter, onLeave]);
}

function isInteractive(el: EventTarget | null): boolean {
  return el instanceof Element && !!el.closest("button, input, textarea, a, [role=slider]");
}

function isTextField(el: EventTarget | null): boolean {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}
