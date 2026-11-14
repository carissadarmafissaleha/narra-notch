import { useContext, useRef } from "react";
import { AnimatePresence, useTransform } from "motion/react";
import { useNowPlaying } from "../platform/media";
import { LiveActivity } from "../features/now-playing/LiveActivity";
import { useLyricsInPillActive } from "../features/lyrics/store";
import { LiveTimer, useTimerLive } from "../features/timer/LiveTimer";
import { LivePrayer, usePrayerLive } from "../features/prayer/LivePrayer";
import { LiveWater } from "../features/water/LiveWater";
import { useWaterAlert } from "../features/water/store";
import { LiveHud } from "../features/hud/LiveHud";
import { useHudLive } from "../features/hud/store";
import { LiveDiscord } from "../features/discord/LiveDiscord";
import { useDiscordCall } from "../features/discord/store";
import { LiveGaming } from "../features/system/LiveGaming";
import { useGamingLive } from "../features/system/gaming";
import { LiveWhatsApp, useWhatsAppLive } from "../features/whatsapp/LiveWhatsApp";
import { LiveAgent, useAgentApproval, useAgentLive } from "../features/agent/LiveAgent";
import { geometry } from "./geometry";
import { LiveSpread, ShapeWidth } from "./liveEdges";

/**
 * Which live activity the closed notch shows. Exactly one, by priority:
 * 1. Agent Quick Approval (critical: AI tool execution blocked waiting for user)
 * 2. Water / Prayer alerts
 * 3. Gaming mode / HUD / Timer
 * 4. Agent background active (thinking / running tool)
 * 5. WhatsApp / Discord / Music
 */
export function useLiveActivity(): { id: string | null } {
  const agentApproval = useAgentApproval();
  const hudLive = useHudLive();
  const gaming = useGamingLive();
  const waterAlert = useWaterAlert();
  const prayer = usePrayerLive();
  const timerLive = useTimerLive();
  const agentLive = useAgentLive();
  const whatsappLive = useWhatsAppLive();
  const call = useDiscordCall();
  const np = useNowPlaying();
  const lyricsInPill = useLyricsInPillActive(np);

  if (agentApproval) return { id: "agent" };
  if (waterAlert) return { id: "water" };
  if (prayer) return { id: "prayer" };
  if (hudLive) return { id: "hud" };
  if (gaming) return { id: "system" };
  if (timerLive) return { id: "timer" };
  if (agentLive) return { id: "agent" };
  if (whatsappLive) return { id: "whatsapp" };
  if (call) return { id: "discord" };
  if (np?.isPlaying) return { id: lyricsInPill ? "media-lyrics" : "media" };
  return { id: null };
}

/**
 * The activity sits in a fixed box the size of the closed live notch, centered. Its two
 * sides (LiveEdge) follow the shape's edges by transform as it opens, closes or peeks.
 * Pinned to the edges by layout instead, they crept in pixel steps (issue #3).
 */
export function LiveSlot({ id }: { id: string | null }) {
  const np = useNowPlaying();
  const lyricsInPill = useLyricsInPillActive(np);
  const call = useDiscordCall();
  // Keep the last size while an activity fades out (id is null when the notch opens).
  const last = useRef(id);
  if (id) last.current = id;
  const isAgentLyrics = last.current === "agent" && lyricsInPill;
  const box =
    last.current === "system"
      ? geometry.gaming
      : last.current === "water" || last.current === "prayer"
        ? geometry.waterAlert
        : last.current === "hud"
          ? geometry.hud
          : last.current === "media-lyrics" || isAgentLyrics
            ? geometry.liveLyrics
            : geometry.live;
  const boxW = useRef(box.w);
  boxW.current = box.w;
  const spread = useTransform(useContext(ShapeWidth), (w) =>
    Math.max(0, (w - boxW.current) / 2),
  );
  return (
    <LiveSpread.Provider value={spread}>
      <div
        className="absolute top-0 left-1/2"
        style={{ width: box.w, height: box.h, marginLeft: -box.w / 2 }}
      >
        <AnimatePresence initial={false}>
          {id === "hud" && <LiveHud key="hud" />}
          {id === "system" && <LiveGaming key="system" />}
          {id === "water" && <LiveWater key="water" />}
          {id === "prayer" && <LivePrayer key="prayer" />}
          {id === "timer" && <LiveTimer key="timer" />}
          {id === "agent" && <LiveAgent key="agent" />}
          {id === "whatsapp" && <LiveWhatsApp key="whatsapp" />}
          {id === "discord" && call && (
            <LiveDiscord key="discord" call={call} />
          )}
          {(id === "media" || id === "media-lyrics") && np && <LiveActivity key="media" np={np} />}
        </AnimatePresence>
      </div>
    </LiveSpread.Provider>
  );
}
