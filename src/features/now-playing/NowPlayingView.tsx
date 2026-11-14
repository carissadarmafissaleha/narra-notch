import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useTransform } from "motion/react";
import {
  ArrowUpRight,
  MusicNoteSimple,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  MicrophoneStage,
  MicrophoneSlash,
} from "@phosphor-icons/react";
import { artwork as artworkSwap, springs } from "../../design/motion";
import { useSmoothArtwork } from "./artwork";
import { livePosition, media, useNowPlaying, type NowPlaying } from "../../platform/media";
import { holdOpen } from "../../notch/useNotchState";
import { requestSize } from "../../notch/size";
import { findTab } from "../../notch/tabs";
import { HeaderActions, HeaderButton } from "../../notch/header";
import { MIXER_MAX_ROWS, MIXER_ROW, MixerList, MixerToggle, useMixer } from "./Mixer";
import { Equalizer } from "./Equalizer";
import { lyricsSettings, toggleLyricsEnabled, useActiveLyric } from "../lyrics/store";
import { t } from "../../i18n";

/*
 * Layout:
 *   [Cover] [Title / Artist (Marquee Loop)] | [3-Line Synchronized Lyrics] [EQ]
 *   0:52 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -3:10
 *                     ⏮          ⏯          ⏭                   [⌄]
 *   (mixer list, the notch grows down)
 */
export function NowPlayingView() {
  const np = useNowPlaying();
  const mix = useMixer();
  const lSettings = lyricsSettings.use();
  const [mixerOpen, setMixerOpen] = useState(false);
  const source = mix.source?.name;

  // The mixer grows the notch down
  const rows = Math.min(MIXER_MAX_ROWS, (mix.system ? 1 : 0) + Math.max(1, mix.apps.length));
  useEffect(() => {
    if (!np) return requestSize("media", null);
    const base = findTab("media")!.size;
    if (mixerOpen) {
      requestSize("media", { w: base.w, h: base.h + rows * MIXER_ROW + 14 });
    } else {
      requestSize("media", null);
    }
  }, [mixerOpen, rows, !!np]);
  useEffect(() => () => requestSize("media", null), []);

  if (!np) return <Empty />;

  const cover = (
    <button
      onClick={() => void media.openSource()}
      title={source ? t("In {app} öffnen", { app: source }) : t("App öffnen")}
      className="group/source pressable shrink-0 rounded-[12px] text-left cursor-pointer"
    >
      <Artwork np={np} />
    </button>
  );
  const trackInfo = (centered: boolean) => (
    <div className={`flex min-w-0 flex-col justify-center overflow-hidden ${centered ? "w-[220px] text-center" : "w-[148px] shrink-0 border-r border-white/10 pr-2.5"}`}>
      <MarqueeText
        text={np.title}
        className={`text-[13px] font-bold text-white tracking-tight mb-0.5 ${centered ? "text-center" : ""}`}
        speed={24}
      />
      <MarqueeText
        text={np.artist}
        className={`text-[11px] font-medium text-zinc-400 ${centered ? "text-center" : ""}`}
        speed={20}
      />
    </div>
  );

  return (
    <div className="flex h-full flex-col px-5 pt-1 pb-2 font-sans select-none">
      <HeaderActions>
        <HeaderButton
          label={lSettings.enabled ? t("Matikan Lirik (Karaoke)") : t("Aktifkan Lirik (Karaoke)")}
          active={lSettings.enabled}
          onClick={toggleLyricsEnabled}
        >
          {lSettings.enabled ? (
            <MicrophoneStage size={14} weight="fill" />
          ) : (
            <MicrophoneSlash size={14} weight="bold" />
          )}
        </HeaderButton>
      </HeaderActions>

      {/* ── TOP ROW: Cover | Title & Artist (Marquee Loop) | 3-Line Lyrics | EQ ── */}
      <div className="flex h-[58px] items-center">
        {lSettings.enabled ? (
          <div className="flex w-full items-center gap-3">
            {cover}
            {trackInfo(false)}
            <div className="flex-1 min-w-0 overflow-hidden px-1">
              <ThreeLineLyrics np={np} />
            </div>
            <div className="shrink-0 pl-1">
              <Equalizer playing={np.isPlaying} height={18} />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center gap-3">
            {cover}
            {trackInfo(true)}
            <Equalizer playing={np.isPlaying} height={18} />
          </div>
        )}
      </div>

      {/* ── PROGRESS BAR ── */}
      <Progress np={np} />

      {/* ── CONTROLS ROW ── */}
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="min-w-0" />
        <Controls playing={np.isPlaying} />
        <div className="flex min-w-0 justify-end">
          <MixerToggle
            open={mixerOpen}
            onToggle={() => setMixerOpen((o) => !o)}
          />
        </div>
      </div>

      {/* ── MIXER PANEL (Optional dropdown) ── */}
      <AnimatePresence>
        {mixerOpen && <MixerList key="mixer" data={mix} />}
      </AnimatePresence>
    </div>
  );
}

// ── MARQUEE RUNNING TEXT (Seamless Loop ke kiri) ──
function MarqueeText({
  text,
  className = "",
  speed = 24,
}: {
  text: string;
  className?: string;
  speed?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [duration, setDuration] = useState(12);

  useEffect(() => {
    const check = () => {
      if (containerRef.current && textRef.current) {
        const cWidth = containerRef.current.clientWidth;
        const tWidth = textRef.current.offsetWidth;
        const isOver = tWidth > cWidth - 2;
        setOverflows(isOver);
        if (isOver) {
          const totalWidth = tWidth + 36;
          setDuration(Math.max(5, totalWidth / speed));
        }
      }
    };
    check();
    const timer = setTimeout(check, 80);
    window.addEventListener("resize", check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", check);
    };
  }, [text, speed]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden whitespace-nowrap ${className}`}
      style={{
        maskImage: overflows
          ? "linear-gradient(to right, transparent 0%, black 5px, black calc(100% - 8px), transparent 100%)"
          : undefined,
        WebkitMaskImage: overflows
          ? "linear-gradient(to right, transparent 0%, black 5px, black calc(100% - 8px), transparent 100%)"
          : undefined,
      }}
      title={text}
    >
      {/* Hidden element strictly for measuring text width */}
      <span
        ref={textRef}
        className="invisible absolute top-0 left-0 pointer-events-none whitespace-nowrap"
        aria-hidden="true"
      >
        {text}
      </span>

      {overflows ? (
        <div
          className="inline-flex whitespace-nowrap animate-marquee"
          style={{ animationDuration: `${duration}s` }}
        >
          <span className="inline-block pr-9 shrink-0">{text}</span>
          <span className="inline-block pr-9 shrink-0">{text}</span>
        </div>
      ) : (
        <div className="truncate">{text}</div>
      )}
    </div>
  );
}

// ── 3-LINE SYNCHRONIZED KARAOKE LYRICS ──
function ThreeLineLyrics({ np }: { np: NowPlaying }) {
  const lSettings = lyricsSettings.use();
  const { lines, currentIndex, hasLyrics, isSynced, isInstrumental, loading } = useActiveLyric(np);

  if (!lSettings.enabled) {
    return (
      <div className="flex items-center justify-between h-[54px] px-2.5 rounded-[8px] bg-white/[0.03] text-zinc-500 text-[11px] font-sans select-none border border-white/5">
        <div className="flex items-center gap-1.5 truncate">
          <MicrophoneSlash size={13} weight="bold" className="shrink-0 text-zinc-500" />
          <span className="truncate">{t("Lirik dinonaktifkan")}</span>
        </div>
        <button
          type="button"
          onClick={toggleLyricsEnabled}
          className="shrink-0 px-2 py-0.5 rounded-[5px] bg-white/10 hover:bg-white/15 text-zinc-300 text-[10.5px] font-medium transition-colors cursor-pointer"
        >
          {t("Aktifkan")}
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 h-[54px] text-zinc-400 text-[11px] font-sans select-none animate-pulse">
        <MusicNoteSimple size={12} weight="bold" className="shrink-0 text-[#38BDF8]" />
        <span className="truncate">{t("Memuat lirik...")}</span>
      </div>
    );
  }

  if (!hasLyrics || lines.length === 0) {
    return (
      <div className="flex items-center gap-1.5 h-[54px] text-zinc-500 text-[11px] italic font-sans select-none">
        <MusicNoteSimple size={12} weight="bold" className="shrink-0" />
        <span className="truncate">{t("Instrumen / Lirik tidak tersedia")}</span>
      </div>
    );
  }

  if (!isSynced) {
    return (
      <div className="flex flex-col justify-center h-[54px] overflow-hidden select-none font-sans py-0.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/90">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400/80 shrink-0" />
          <span className="truncate">{lines[0]?.text || t("Lirik Teks")}</span>
        </div>
        <div className="text-[10px] text-zinc-400 truncate">
          {lines[1]?.text || t("Lirik tanpa sinkronisasi waktu")}
        </div>
      </div>
    );
  }

  const prevLine = currentIndex > 0 ? lines[currentIndex - 1] : null;
  const currLine =
    currentIndex >= 0
      ? lines[currentIndex]
      : isInstrumental
      ? { text: "♪ (Intro...)", time: 0 }
      : lines[0];
  const nextLine =
    currentIndex >= 0 && currentIndex + 1 < lines.length
      ? lines[currentIndex + 1]
      : currentIndex < 0
      ? lines[1]
      : null;

  return (
    <div className="flex flex-col justify-center h-[54px] overflow-hidden select-none font-sans py-0.5">
      {/* Line 1: Previous Line */}
      <button
        type="button"
        onClick={() => prevLine && media.seek(prevLine.time)}
        className="h-[15px] text-[10.5px] font-medium text-white/30 truncate text-left transition-colors hover:text-white/60 cursor-pointer"
        title={prevLine?.text}
      >
        {prevLine?.text || "\u00A0"}
      </button>

      {/* Line 2: Active Karaoke Line (Electric Blue glow & bold) */}
      <div className="h-[21px] flex items-center gap-1.5 text-[12px] font-bold text-white tracking-tight drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] transition-all">
        <span className="h-1.5 w-1.5 rounded-full bg-[#38BDF8] shadow-[0_0_6px_#38BDF8] shrink-0 animate-pulse" />
        <span className="truncate">{currLine?.text || "..."}</span>
      </div>

      {/* Line 3: Next Line */}
      <button
        type="button"
        onClick={() => nextLine && media.seek(nextLine.time)}
        className="h-[15px] text-[10.5px] font-medium text-white/35 truncate text-left transition-colors hover:text-white/60 cursor-pointer"
        title={nextLine?.text}
      >
        {nextLine?.text || "\u00A0"}
      </button>
    </div>
  );
}

/** Shared with the overview: clicking the activity flies the cover here. */
export const ARTWORK_LAYOUT_ID = "now-playing-artwork";

function Artwork({ np }: { np: NowPlaying }) {
  const artwork = useSmoothArtwork(np.artwork);
  return (
    <motion.div layoutId={ARTWORK_LAYOUT_ID} transition={springs.morph} className="size-14 shrink-0">
      <motion.div
        className="relative size-14 shrink-0"
        initial={false}
        animate={{ transform: np.isPlaying ? "scale(1)" : "scale(0.9)" }}
        transition={springs.snappy}
      >
        <AnimatePresence initial={false}>
          {artwork ? (
            <motion.img
              key={artwork}
              src={artwork}
              alt=""
              draggable={false}
              className="absolute inset-0 size-full rounded-[12px] object-cover"
              initial={{ opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)", transition: artworkSwap.enter }}
              exit={{ opacity: 0, transition: artworkSwap.exit }}
            />
          ) : (
            <motion.div
              key="placeholder"
              className="absolute inset-0 flex items-center justify-center rounded-[12px] bg-fill-2 text-label-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: artworkSwap.enter }}
              exit={{ opacity: 0, transition: artworkSwap.exit }}
            >
              <MusicNoteSimple size={22} weight="fill" />
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-[12px]"
          initial={false}
          animate={{ backgroundColor: np.isPlaying ? "rgb(0 0 0 / 0)" : "rgb(0 0 0 / 0.35)" }}
          transition={{ duration: 0.25 }}
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[12px] bg-black/45 text-label opacity-0 transition-opacity duration-150 group-hover/source:opacity-100">
          <ArrowUpRight size={20} weight="bold" />
        </span>
      </motion.div>
    </motion.div>
  );
}

function Progress({ np }: { np: NowPlaying }) {
  const track = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<number | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [hover, setHover] = useState(false);
  const npRef = useRef(np);
  npRef.current = np;

  const ratio = () => {
    const n = npRef.current;
    return scrubRef.current ?? (n.duration > 0 ? livePosition(n) / n.duration : 0);
  };
  const progress = useMotionValue(ratio());
  useAnimationFrame(() => progress.set(ratio()));
  const transform = useTransform(progress, (p) => `translateX(${((p - 1) * 100).toFixed(3)}%)`);

  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (np.duration <= 0) return <div className="mt-3.5 h-[14px]" />;

  const pos = scrub !== null ? scrub * np.duration : livePosition(np);
  const active = scrub !== null || (hover && np.canSeek);

  const at = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };
  const move = (clientX: number) => {
    scrubRef.current = at(clientX);
    setScrub(scrubRef.current);
  };
  const end = (commit: boolean) => {
    if (scrubRef.current === null) return;
    if (commit) media.seek(scrubRef.current * np.duration);
    scrubRef.current = null;
    setScrub(null);
    holdOpen(false);
  };

  return (
    <div className="mt-3.5 flex items-center gap-2.5">
      <span className={`tabular w-9 text-caption font-medium transition-colors duration-150 ${scrub !== null ? "text-label" : "text-label-3"}`}>
        {format(pos)}
      </span>
      <div
        ref={track}
        className={`relative flex h-4 flex-1 items-center ${np.canSeek ? "touch-none" : ""}`}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onPointerDown={(e) => {
          if (!np.canSeek || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          holdOpen(true);
          move(e.clientX);
        }}
        onPointerMove={(e) => scrubRef.current !== null && move(e.clientX)}
        onPointerUp={() => end(true)}
        onPointerCancel={() => end(false)}
        onLostPointerCapture={() => end(true)}
      >
        <div
          className={`relative w-full overflow-hidden rounded-full bg-fill-2 transition-[height] duration-150 ease-out ${active ? "h-[9px]" : "h-[5px]"}`}
        >
          <motion.div
            className={`absolute inset-0 rounded-full transition-colors duration-150 ${active ? "bg-label" : "bg-label-2"}`}
            style={{ transform }}
          />
        </div>
      </div>
      <span className={`tabular w-9 text-right text-caption font-medium transition-colors duration-150 ${scrub !== null ? "text-label" : "text-label-3"}`}>
        -{format(np.duration - pos)}
      </span>
    </div>
  );
}

function Controls({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-center justify-center gap-6">
      <IconButton label={t("Zurück")} onClick={media.previous}>
        <SkipBack size={20} weight="fill" />
      </IconButton>
      <button
        aria-label={playing ? t("Pause") : t("Abspielen")}
        onClick={media.toggle}
        className="pressable flex size-12 items-center justify-center rounded-full bg-tint text-black cursor-pointer hover:brightness-110 shadow-md transition-all"
        style={{ boxShadow: "0 4px 16px -4px color-mix(in srgb, var(--tint) 55%, transparent)" }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={playing ? "pause" : "play"}
            className="flex"
            initial={{ opacity: 0, transform: "scale(0.6)", filter: "blur(3px)" }}
            animate={{ opacity: 1, transform: "scale(1)", filter: "blur(0px)" }}
            exit={{ opacity: 0, transform: "scale(0.6)", filter: "blur(3px)" }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
          >
            {playing ? <Pause size={26} weight="fill" /> : <Play size={26} weight="fill" />}
          </motion.span>
        </AnimatePresence>
      </button>
      <IconButton label={t("Weiter")} onClick={media.next}>
        <SkipForward size={20} weight="fill" />
      </IconButton>
    </div>
  );
}

function IconButton(props: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={props.label}
      onClick={props.onClick}
      className="pressable pressable-fill flex size-10 items-center justify-center rounded-full text-label cursor-pointer"
    >
      {props.children}
    </button>
  );
}

function Empty() {
  return (
    <div className="flex h-full items-center justify-center text-body text-label-3">{t("Gerade läuft nichts")}</div>
  );
}

function format(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
