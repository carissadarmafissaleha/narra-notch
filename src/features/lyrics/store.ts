import { useEffect, useState, useRef } from "react";
import { createStore } from "../../lib/store";
import { livePosition, type NowPlaying } from "../../platform/media";
import { fetchLyrics } from "./lrclib";
import type { LyricLine, LyricsData, LyricsSettings } from "./types";

export const DEFAULT_LYRICS_SETTINGS: LyricsSettings = {
  enabled: true,
  showInPill: true,
  syncOffset: 0,
};

export const lyricsSettings = createStore<LyricsSettings>(DEFAULT_LYRICS_SETTINGS, {
  persist: "lyrics_settings",
});

export function toggleLyricsEnabled() {
  lyricsSettings.set((s) => ({ ...s, enabled: !s.enabled }));
}

export function toggleLyricsInPill() {
  lyricsSettings.set((s) => ({ ...s, showInPill: !s.showInPill }));
}

export function setLyricsSyncOffset(delta: number) {
  lyricsSettings.set((s) => {
    const cur = s.syncOffset ?? 0;
    const next = Math.round((cur + delta) * 10) / 10;
    return { ...s, syncOffset: Math.max(-5, Math.min(5, next)) };
  });
}

export function resetLyricsSyncOffset() {
  lyricsSettings.set((s) => ({ ...s, syncOffset: 0 }));
}

/**
 * Hook that loads lyrics for the currently playing track
 */
export function useLyrics(np: NowPlaying | null): {
  lyrics: LyricsData | null;
  loading: boolean;
} {
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const resolvedKey = useRef("");

  const durationSec = Math.round(np?.duration ?? 0);

  useEffect(() => {
    if (!np || !np.title) {
      setLyrics(null);
      setLoading(false);
      resolvedKey.current = "";
      return;
    }

    const key = `${np.title}::${np.artist}::${durationSec}`;
    if (key === resolvedKey.current) return;

    let cancelled = false;
    setLyrics(null);
    setLoading(true);

    void fetchLyrics(np.title, np.artist, np.duration).then((data) => {
      if (!cancelled) {
        resolvedKey.current = key;
        setLyrics(data);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [np?.title, np?.artist, durationSec]);

  return { lyrics, loading };
}

export interface ActiveLyricsState {
  currentLine: LyricLine | null;
  currentIndex: number;
  lines: LyricLine[];
  hasLyrics: boolean;
  isSynced: boolean;
  isInstrumental: boolean;
  loading: boolean;
}

/**
 * Build estimated lines from plain lyrics when synced LRC is not available
 */
function buildEstimatedLines(plain: string, duration: number): LyricLine[] {
  const rawLines = plain
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (rawLines.length === 0) return [];
  const totalSpan = duration > 15 ? duration * 0.92 : rawLines.length * 3.5;
  const step = totalSpan / rawLines.length;
  return rawLines.map((text, idx) => ({
    time: Math.max(0, idx * step),
    text,
  }));
}

/**
 * Hook that calculates the current active synchronized lyric line in real-time
 */
export function useActiveLyric(np: NowPlaying | null): ActiveLyricsState {
  const { lyrics, loading } = useLyrics(np);
  const lSettings = lyricsSettings.use();
  const [currentLine, setCurrentLine] = useState<LyricLine | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isInstrumental, setIsInstrumental] = useState(false);

  const isTrulySynced = Boolean(lyrics?.synced && lyrics.synced.length > 0);
  const activeLines: LyricLine[] = isTrulySynced
    ? lyrics!.synced!
    : lyrics?.plain
    ? buildEstimatedLines(lyrics.plain, np?.duration ?? 180)
    : [];

  useEffect(() => {
    if (!np || activeLines.length === 0) {
      setCurrentLine(null);
      setCurrentIndex(-1);
      setIsInstrumental(false);
      return;
    }

    const check = () => {
      const pos = livePosition(np);
      const syncOffset = lSettings.syncOffset ?? 0;
      // 0.12s perceptual lead-in + customizable sync calibration offset
      const targetTime = pos + 0.12 + syncOffset;

      let idx = -1;
      for (let i = 0; i < activeLines.length; i++) {
        if (activeLines[i].time <= targetTime) {
          idx = i;
        } else {
          break;
        }
      }

      if (idx !== -1) {
        const line = activeLines[idx];
        const nextLine = activeLines[idx + 1];

        // Is this line empty or musical mark?
        const isMusicalMark =
          !line.text ||
          /^([♪♫\s\.\-—_~]|[\(\[]\s*(instrumental|music|solo|intro|outro)\s*[\)\]])+$/i.test(
            line.text.trim()
          );

        // A line stays active until the next line starts.
        // We only enter an instrumental break during extended pauses between vocal sections.
        const gap = nextLine ? nextLine.time - line.time : 0;
        const lineElapsed = targetTime - line.time;
        const textLen = line.text.trim().length;
        const estimatedSingingDuration = Math.min(Math.max(4.0, textLen * 0.35), 8.5);
        const isLongInterlude =
          isTrulySynced &&
          nextLine &&
          gap > 6.5 &&
          lineElapsed > estimatedSingingDuration &&
          nextLine.time - targetTime > 2.0;

        const isBreak = isMusicalMark || isLongInterlude;

        setCurrentIndex(idx);
        setCurrentLine(line);
        setIsInstrumental(Boolean(isBreak));
      } else {
        // Before the first lyric line starts (Intro music)
        setCurrentIndex(-1);
        setCurrentLine(null);
        setIsInstrumental(true);
      }
    };

    check();
    const intervalMs = np.isPlaying ? 80 : 300;
    const timer = setInterval(check, intervalMs);
    return () => clearInterval(timer);
  }, [np, lyrics, activeLines.length, isTrulySynced, lSettings.syncOffset]);

  return {
    currentLine,
    currentIndex,
    lines: activeLines,
    hasLyrics: activeLines.length > 0,
    isSynced: isTrulySynced,
    isInstrumental,
    loading,
  };
}

export function useLyricsInPillActive(np: NowPlaying | null): boolean {
  const lSettings = lyricsSettings.use();
  const { hasLyrics, isSynced } = useActiveLyric(np);
  return Boolean(np?.isPlaying && lSettings.enabled && lSettings.showInPill && hasLyrics && isSynced);
}
