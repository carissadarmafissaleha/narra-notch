import { motion, AnimatePresence } from "motion/react";
import { ShieldWarning, MusicNoteSimple } from "@phosphor-icons/react";
import { content } from "../../design/motion";
import { LiveEdge } from "../../notch/liveEdges";
import { AgyIndicator } from "./AgyIndicator";
import { agentStore, initAgentStore } from "./store";
import { MochiCanvas } from "./MochiCanvas";
import { settings } from "../../settings/store";
import { useEffect } from "react";
import { resolveOutfit, type OutfitSelection } from "./coucou/wardrobe";
import { useNowPlaying } from "../../platform/media";
import { lyricsSettings, useActiveLyric } from "../lyrics/store";
import { Equalizer } from "../now-playing/Equalizer";
import { navigate } from "../../notch/nav";

export function LiveAgent() {
  const s = agentStore.use();
  const set = settings.use();
  const trackCursor = set.codingAgent?.trackCursor ?? true;
  const outfitSelection = (set.codingAgent?.mochiOutfit || "auto") as OutfitSelection;
  const outfit = resolveOutfit(outfitSelection, new Date());
  const closedNotchMochi = set.codingAgent?.closedNotchMochi ?? true;

  const np = useNowPlaying();
  const { currentLine, hasLyrics, isInstrumental } = useActiveLyric(np);
  const lSettings = lyricsSettings.use();
  const showLyrics = Boolean(np?.isPlaying && lSettings.enabled && lSettings.showInPill && hasLyrics);
  const isBreak = isInstrumental || !currentLine?.text;

  useEffect(() => {
    initAgentStore();
  }, []);

  // If user disabled the Coding Agent tool completely in Settings -> Tools
  const isAgentToolEnabled = set.tools.find((t) => t.id === "agent")?.enabled !== false;
  if (!isAgentToolEnabled) {
    return null;
  }

  // If user disabled mochi in codingAgent settings
  if (set.codingAgent?.mochiEnabled === false) {
    return null;
  }

  // If not connected / not active, closed notch must remain clean without Mochi!
  if (!s.active && !s.pendingApproval) {
    return null;
  }

  // If user disabled closed notch mochi in settings and no active tool/approval
  if (!closedNotchMochi && s.status === "idle" && !s.pendingApproval) {
    return null;
  }

  const isApproval = Boolean(s.pendingApproval) || s.status === "waiting_approval";
  const isThinking = s.status === "thinking";
  const isFinished = s.status === "finished";

  const botState = isApproval
    ? "approval"
    : isThinking
    ? "thinking"
    : isFinished
    ? "finished"
    : s.status === "working" || s.status === "tool_running"
    ? "working"
    : "idle";

  // CASE 1: Music is playing with Synced Karaoke Lyrics (Combined Pill!)
  if (showLyrics) {
    return (
      <motion.div
        className="absolute inset-0 flex items-center justify-between px-[9px] select-none h-full"
        initial={{ opacity: 0, filter: "blur(4px)" }}
        animate={{ opacity: 1, filter: "blur(0px)", transition: content.enter }}
        exit={{ opacity: 0, filter: "blur(4px)", transition: content.exit }}
      >
        <LiveEdge side="left" className="flex items-center justify-center h-full">
          <div className="flex items-center justify-center h-full">
            <MochiCanvas
              size={25}
              outfit={outfit}
              bodyColor={null}
              state={botState}
              trackCursor={trackCursor}
              glow={false}
              className="h-full flex items-center justify-center"
            />
          </div>
        </LiveEdge>

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

        <LiveEdge side="right">
          {isApproval ? (
            <div
              className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 cursor-pointer hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                navigate("agent");
                window.dispatchEvent(new CustomEvent("notch:open", { detail: { tab: "agent" } }));
              }}
            >
              <ShieldWarning size={13} weight="fill" className="animate-pulse" />
              <span>Approve</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {isThinking && (
                <span className="relative flex h-2 w-2" title="Antigravity thinking...">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
                </span>
              )}
              {(s.status === "working" || s.status === "tool_running") && (
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" title="Antigravity working" />
              )}
              {isFinished && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Finished" />
              )}
              <Equalizer playing={np?.isPlaying ?? false} />
            </div>
          )}
        </LiveEdge>
      </motion.div>
    );
  }

  // CASE 2: Connected and Idle (without music lyrics): display centered Mochi in closed notch
  if (s.status === "idle" && !s.pendingApproval) {
    if (np?.isPlaying) {
      // Music is playing without lyrics: show Mochi on left, Equalizer on right
      return (
        <motion.div
          className="absolute inset-0 flex items-center justify-between px-[9px] select-none h-full"
          initial={{ opacity: 0, filter: "blur(4px)" }}
          animate={{ opacity: 1, filter: "blur(0px)", transition: content.enter }}
          exit={{ opacity: 0, filter: "blur(4px)", transition: content.exit }}
        >
          <LiveEdge side="left" className="flex items-center justify-center h-full">
            <div className="flex items-center justify-center h-full">
              <MochiCanvas
                size={25}
                outfit={outfit}
                bodyColor={null}
                state="idle"
                trackCursor={trackCursor}
                glow={false}
                className="h-full flex items-center justify-center"
              />
            </div>
          </LiveEdge>
          <LiveEdge side="right">
            <Equalizer playing={np.isPlaying} />
          </LiveEdge>
        </motion.div>
      );
    }

    return (
      <motion.div
        className="absolute inset-0 flex items-center justify-center select-none h-full"
        initial={{ opacity: 0, filter: "blur(4px)" }}
        animate={{ opacity: 1, filter: "blur(0px)", transition: content.enter }}
        exit={{ opacity: 0, filter: "blur(4px)", transition: content.exit }}
      >
        <MochiCanvas
          size={25}
          outfit={outfit}
          bodyColor={null}
          state="idle"
          trackCursor={trackCursor}
          glow={false}
          className="h-full flex items-center justify-center"
        />
      </motion.div>
    );
  }

  // CASE 3: Active / running tool or awaiting approval (without music lyrics): Mochi on left, status on right
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-between px-[9px] select-none h-full"
      initial={{ opacity: 0, filter: "blur(4px)" }}
      animate={{ opacity: 1, filter: "blur(0px)", transition: content.enter }}
      exit={{ opacity: 0, filter: "blur(4px)", transition: content.exit }}
    >
      <LiveEdge side="left" className="flex items-center justify-center h-full">
        <div className="flex items-center justify-center h-full">
          <MochiCanvas
            size={25}
            outfit={outfit}
            bodyColor={null}
            state={botState}
            trackCursor={trackCursor}
            glow={false}
            className="h-full flex items-center justify-center"
          />
        </div>
      </LiveEdge>

      <LiveEdge side="right">
        {np?.isPlaying ? (
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-wide ${
                isApproval
                  ? "text-amber-400"
                  : isThinking
                  ? "text-sky-400"
                  : "text-emerald-400"
              }`}
            >
              {isApproval ? (
                <span className="flex items-center gap-1">
                  <ShieldWarning size={13} weight="fill" className="animate-pulse" />
                  <span>Approve</span>
                </span>
              ) : isThinking ? (
                <span className="flex items-center gap-1.5">
                  <AgyIndicator active={true} size={12} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
                  <span className="animate-agy-shimmer">Thinking...</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 truncate max-w-[80px]">
                  <AgyIndicator active={s.status === "tool_running"} size={12} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
                  <span className="animate-agy-shimmer truncate">
                    {s.currentTool || "Active"}
                  </span>
                </span>
              )}
            </div>
            <Equalizer playing={np.isPlaying} />
          </div>
        ) : (
          <div
            className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-wide ${
              isApproval
                ? "text-amber-400"
                : isThinking
                ? "text-sky-400"
                : "text-emerald-400"
            }`}
          >
            {isApproval ? (
              <span className="flex items-center gap-1">
                <ShieldWarning size={13} weight="fill" className="animate-pulse" />
                <span>Approve</span>
              </span>
            ) : isThinking ? (
              <span className="flex items-center gap-1.5 truncate max-w-[110px]">
                <AgyIndicator active={true} size={12} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
                <span className="animate-agy-shimmer">Thinking...</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 truncate max-w-[110px]">
                {s.status === "tool_running" ? (
                  <>
                    <AgyIndicator active={true} size={12} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
                    <span className="animate-agy-shimmer truncate">
                      {s.currentTool || "Coding Agent"}
                    </span>
                  </>
                ) : (
                  <>
                    <AgyIndicator active={false} size={12} className="text-zinc-500" />
                    <span className="truncate">
                      {s.currentTool || "Coding Agent"}
                    </span>
                  </>
                )}
              </span>
            )}
          </div>
        )}
      </LiveEdge>
    </motion.div>
  );
}

export function useAgentApproval(): boolean {
  const s = agentStore.use();
  const set = settings.use();
  const isAgentToolEnabled = set.tools.find((t) => t.id === "agent")?.enabled !== false;
  if (!isAgentToolEnabled) return false;
  if (set.codingAgent?.mochiEnabled === false) return false;
  return Boolean(s.pendingApproval) || s.status === "waiting_approval";
}

export function useAgentLive(): boolean {
  const s = agentStore.use();
  const set = settings.use();
  const isAgentToolEnabled = set.tools.find((t) => t.id === "agent")?.enabled !== false;
  if (!isAgentToolEnabled) return false;
  if (set.codingAgent?.mochiEnabled === false) return false;
  const closedNotchMochi = set.codingAgent?.closedNotchMochi ?? true;

  // Active if approval pending or agent running a task
  if (Boolean(s.pendingApproval) || (s.active && s.status !== "idle")) {
    return true;
  }

  // Active when connected and idle (if closedNotchMochi enabled)
  return s.active && closedNotchMochi;
}
