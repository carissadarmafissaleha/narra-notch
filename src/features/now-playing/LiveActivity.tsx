import { AnimatePresence, motion } from "motion/react";
import { MusicNoteSimple } from "@phosphor-icons/react";
import { artwork as artworkSwap, content } from "../../design/motion";
import { useSmoothArtwork } from "./artwork";
import type { NowPlaying } from "../../platform/media";
import { Equalizer } from "./Equalizer";
import { LiveEdge } from "../../notch/liveEdges";
import { lyricsSettings, useActiveLyric } from "../lyrics/store";

/**
 * Closed notch while music plays: cover on the left, equalizer on the right,
 * and synchronized live lyrics in the middle if enabled.
 */
export function LiveActivity({ np }: { np: NowPlaying }) {
  const { currentLine, hasLyrics, isSynced, isInstrumental } = useActiveLyric(np);
  const lSettings = lyricsSettings.use();
  const showLyrics = lSettings.enabled && lSettings.showInPill && hasLyrics && isSynced;
  const isBreak = isInstrumental || !currentLine?.text;

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-between px-[9px] select-none"
      initial={{ opacity: 0, filter: "blur(4px)" }}
      animate={{ opacity: 1, filter: "blur(0px)", transition: content.enter }}
      exit={{ opacity: 0, filter: "blur(4px)", transition: content.exit }}
    >
      <LiveEdge side="left">
        <LiveArtwork artwork={np.artwork} />
      </LiveEdge>

      {showLyrics && (
        <div className="flex-1 px-2.5 overflow-hidden flex items-center justify-center min-w-0">
          <AnimatePresence mode="wait">
            {isBreak ? (
              <motion.div
                key="instrumental-break"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-center gap-1.5 text-white/70"
                title="Musik / Instrumental"
              >
                <MusicNoteSimple size={13} weight="fill" className="text-white/80 animate-pulse" />
                <span className="flex items-center gap-0.5 text-white/40">
                  <span className="size-1 rounded-full bg-white/40" />
                  <span className="size-1 rounded-full bg-white/40" />
                  <span className="size-1 rounded-full bg-white/40" />
                </span>
                <MusicNoteSimple size={11} weight="bold" className="text-white/60" />
              </motion.div>
            ) : (
              <motion.span
                key={currentLine?.text}
                initial={{ opacity: 0, y: 3, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -3, filter: "blur(2px)" }}
                transition={{ duration: 0.2 }}
                className="truncate text-[11px] font-semibold text-white/95 text-center tracking-tight"
              >
                {currentLine?.text}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      )}

      <LiveEdge side="right">
        <Equalizer playing={np.isPlaying} />
      </LiveEdge>
    </motion.div>
  );
}

/**
 * Track or app change: the new cover (already decoded) fades in on top of the old one
 * with a blur bridge, the old one leaves a beat later. No cut, no gap, same calm
 * pace as the accent color of the equalizer.
 */
function LiveArtwork({ artwork: src }: { artwork: string | null }) {
  const artwork = useSmoothArtwork(src);
  return (
    <div className="relative size-5 shrink-0">
      <AnimatePresence initial={false}>
        <motion.div
          key={artwork ?? "placeholder"}
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0, transform: "scale(0.94)", filter: "blur(3px)" }}
          animate={{ opacity: 1, transform: "scale(1)", filter: "blur(0px)", transition: artworkSwap.enter }}
          exit={{ opacity: 0, filter: "blur(2px)", transition: artworkSwap.exit }}
        >
          {artwork ? (
            <img src={artwork} alt="" draggable={false} className="size-5 rounded-[5px] object-cover" />
          ) : (
            <div className="flex size-5 items-center justify-center rounded-[5px] bg-fill-2 text-label-3">
              <MusicNoteSimple size={13} weight="fill" />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
