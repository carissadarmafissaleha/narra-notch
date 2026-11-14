import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Quotes, Check, ArrowsClockwise, MusicNoteSimple } from "@phosphor-icons/react";
import { media, type NowPlaying } from "../../platform/media";
import { t } from "../../i18n";
import {
  lyricsSettings,
  toggleLyricsInPill,
  setLyricsSyncOffset,
  resetLyricsSyncOffset,
  useActiveLyric,
  useLyrics,
} from "./store";

export function LyricsPanel({ np }: { np: NowPlaying }) {
  const { lyrics, loading } = useLyrics(np);
  const { lines, currentIndex, isSynced } = useActiveLyric(np);
  const settings = lyricsSettings.use();
  const listRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll the active line into center
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentIndex]);

  const handleSeek = (time: number) => {
    media.seek(time);
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-2.5 flex flex-col overflow-hidden rounded-[14px] border border-white/10 bg-white/[0.04] p-3 text-white select-none"
    >
      {/* Top Header of Lyrics Card */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center gap-1.5 text-white/60">
          <Quotes size={14} weight="fill" />
          <span className="text-[11px] font-bold tracking-tight text-white/90">
            {t("Lyrics")} (lrclib.net)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Sync calibration nudge buttons when lyrics are synced */}
          {isSynced && (
            <div className="flex items-center rounded-full bg-white/[0.06] border border-white/10 px-1 py-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => setLyricsSyncOffset(-0.5)}
                className="px-1.5 hover:text-white text-white/60 transition-colors font-mono cursor-pointer"
                title={t("Percepat lirik 0.5 detik")}
              >
                -0.5s
              </button>
              <button
                type="button"
                onClick={resetLyricsSyncOffset}
                className="px-1 text-[9.5px] font-mono text-zinc-300 hover:text-white"
                title={t("Reset offset sinkronisasi lirik")}
              >
                {settings.syncOffset && settings.syncOffset !== 0
                  ? `${settings.syncOffset > 0 ? "+" : ""}${settings.syncOffset.toFixed(1)}s`
                  : t("Sync")}
              </button>
              <button
                type="button"
                onClick={() => setLyricsSyncOffset(0.5)}
                className="px-1.5 hover:text-white text-white/60 transition-colors font-mono cursor-pointer"
                title={t("Perlambat lirik 0.5 detik")}
              >
                +0.5s
              </button>
            </div>
          )}

          {/* Toggle Pill Notification button */}
          <button
            onClick={toggleLyricsInPill}
            className={`pressable flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-all ${
              settings.showInPill
                ? "bg-white text-black shadow-sm"
                : "bg-white/[0.08] text-white/50 hover:bg-white/[0.14] hover:text-white"
            }`}
            title={t("Tampilkan lirik di notch pil saat tertutup")}
          >
            {settings.showInPill && <Check size={11} weight="bold" />}
            <span>{t("Notch Pil")}</span>
          </button>
        </div>
      </div>

      {/* Main Lyrics Area */}
      <div
        ref={listRef}
        className="mt-2 max-h-[145px] overflow-y-auto pr-1 flex flex-col gap-2 scrollbar-none"
        style={{ scrollbarWidth: "none" }}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[12px] font-medium text-white/50">
            <ArrowsClockwise size={15} className="animate-spin text-white/70" />
            <span>{t("Memuat lirik dari lrclib.net...")}</span>
          </div>
        ) : lines && lines.length > 0 ? (
          lines.map((line, idx) => {
            const isActive = idx === currentIndex;
            const isLineEmpty =
              !line.text ||
              /^([♪♫\s\.\-—_~]|[\(\[]\s*(instrumental|music|solo|intro|outro)\s*[\)\]])+$/i.test(
                line.text.trim()
              );
            return (
              <button
                key={`${line.time}-${idx}`}
                ref={isActive ? activeLineRef : null}
                onClick={() => handleSeek(line.time)}
                className={`text-left transition-all rounded px-1.5 py-0.5 flex items-center gap-2 ${
                  isActive
                    ? "text-[14px] font-bold text-white scale-[1.01] bg-white/[0.08]"
                    : "text-[12px] font-medium text-white/40 hover:text-white/80"
                }`}
              >
                {isLineEmpty ? (
                  <span className="flex items-center gap-1.5 py-0.5 text-white/50">
                    <MusicNoteSimple
                      size={13}
                      weight={isActive ? "fill" : "regular"}
                      className={isActive ? "text-white animate-pulse" : "text-white/40"}
                    />
                    <span className="text-[11px] font-semibold tracking-wider text-white/40">♪ ♪</span>
                  </span>
                ) : (
                  line.text
                )}
              </button>
            );
          })
        ) : lyrics?.plain ? (
          <div className="whitespace-pre-line text-[12px] font-medium text-white/70 py-1">
            {lyrics.plain}
          </div>
        ) : (
          <div className="py-6 text-center text-[12px] font-medium text-white/40">
            {t("Lirik tidak ditemukan di lrclib.net")}
          </div>
        )}
      </div>
    </motion.div>
  );
}
