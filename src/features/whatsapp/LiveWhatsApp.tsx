import { motion } from "motion/react";
import { WhatsAppLogo } from "../../ui/brands";
import { content } from "../../design/motion";
import { LiveEdge } from "../../notch/liveEdges";
import { whatsappStore } from "./store";

export function LiveWhatsApp() {
  const s = whatsappStore.use();
  const alert = s.liveAlert;

  if (!alert && !s.webActive) return null;

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-between px-[9px] select-none"
      initial={{ opacity: 0, filter: "blur(4px)" }}
      animate={{ opacity: 1, filter: "blur(0px)", transition: content.enter }}
      exit={{ opacity: 0, filter: "blur(4px)", transition: content.exit }}
    >
      <LiveEdge side="left">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#25D366] text-black">
          <WhatsAppLogo size={13} />
        </div>
      </LiveEdge>

      <LiveEdge side="right">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#25D366]">
          <span className="truncate max-w-[120px]">
            {alert ? alert.title : "WhatsApp Web"}
          </span>
        </div>
      </LiveEdge>
    </motion.div>
  );
}

export function useWhatsAppLive(): boolean {
  const s = whatsappStore.use();
  return Boolean(s.liveAlert || s.webActive);
}
