import { useEffect, useRef, useState } from "react";
import {
  OUTFIT_SELECTIONS,
  OUTFIT_KEYS,
  wardrobeHeader,
  seasonalOutfit,
  resolveOutfit,
  type OutfitSelection,
  type Outfit,
} from "./coucou/wardrobe";
import { drawWardrobeIcon } from "./coucou/outfits";
import { MochiCanvas } from "./MochiCanvas";
import { settings, updateSettings } from "../../settings/store";
import { isNative } from "../../platform/native";
import { companionFetch } from "../../platform/companionUrl";
import { t } from "../../i18n";

interface WardrobeViewProps {
  onClose?: () => void;
  mobile?: boolean;
}

export function WardrobeView({ onClose: _onClose, mobile = false }: WardrobeViewProps) {
  const set = settings.use();
  const currentSelection = (set.codingAgent?.mochiOutfit || "auto") as OutfitSelection;

  const [hovered, setHovered] = useState<OutfitSelection | null>(null);
  const now = new Date();
  const currentOutfit = resolveOutfit(currentSelection, now);
  const previewOutfit: Outfit = hovered ? resolveOutfit(hovered, now) : currentOutfit;

  const headerNote = wardrobeHeader(hovered, currentSelection, now);

  const handleSelect = (sel: OutfitSelection) => {
    updateSettings((s) => ({
      ...s,
      codingAgent: {
        ...s.codingAgent,
        mochiOutfit: sel,
      },
    }));
    try {
      localStorage.setItem("mochi:outfit", sel);
    } catch {}
    // In the Windows notch the companion server is reached through Tauri
    // (`set_companion_outfit` in main.tsx); the relative URL only exists in the
    // phone/PWA build.
    if (!isNative) {
      companionFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outfit: sel }),
      }).catch(() => {});
    }
  };

  return (
    <div className="relative flex h-full w-full items-center overflow-hidden select-none font-sans text-zinc-200">
      {/* Soft ambient aura (Antigravity Blue) */}
      <div
        className="absolute -top-10 -left-10 pointer-events-none rounded-full blur-3xl opacity-25"
        style={{
          width: 240,
          height: 240,
          background: "radial-gradient(circle, rgba(56, 189, 248, 0.25) 0%, transparent 70%)",
        }}
      />

      {/* Left (30% column): Preview Mochi */}
      <div className="relative w-[30%] shrink-0 flex items-center justify-center z-10">
        <MochiCanvas
          size={90}
          outfit={previewOutfit}
          bodyColor={null}
          state="idle"
          trackCursor={true}
          glow={mobile}
        />
      </div>

      {/* Right (70% column): Wardrobe Header + 2-Row Outfit Grid */}
      <div className="relative w-[70%] flex flex-col justify-center min-w-0 pl-2 z-10">
        <div className="flex items-baseline justify-between mb-2 pr-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#38BDF8] shadow-[0_0_8px_#38BDF8]" />
            <span className="text-[14px] font-bold text-white tracking-tight">{t("Wardrobe")}</span>
          </div>
          <span className="text-[11px] text-zinc-400 font-medium truncate max-w-[220px]">
            {headerNote}
          </span>
        </div>

        {/* 2-Row Grid of Outfit Buttons (7 items top, 6 items bottom, no horizontal scroll or cutoff) */}
        <div className={`grid ${mobile ? "grid-cols-5" : "grid-cols-7"} gap-1.5 py-1 max-w-fit`}>
          {OUTFIT_SELECTIONS.map((sel) => {
            const isSelected = sel === currentSelection;
            const isHovered = sel === hovered;
            return (
              <OutfitButton
                key={sel}
                selection={sel}
                isSelected={isSelected}
                isHovered={isHovered}
                onMouseEnter={() => setHovered(sel)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => handleSelect(sel)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OutfitButton({
  selection,
  isSelected,
  isHovered: _isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  selection: OutfitSelection;
  isSelected: boolean;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ICON = 28;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(ICON * dpr);
    canvas.height = Math.round(ICON * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const season = seasonalOutfit(new Date());
    drawWardrobeIcon(ctx, ICON, selection, season, "AUTO");
  }, [selection]);

  return (
    <button
      type="button"
      className={`group relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] border transition-all duration-150 ${
        isSelected
          ? "border-white/40 bg-white/15 shadow-sm"
          : "border-white/10 bg-white/[0.06] hover:border-white/25 hover:bg-white/10"
      }`}
      title={OUTFIT_KEYS[selection]}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      <canvas
        ref={canvasRef}
        style={{ width: 28, height: 28 }}
        className="pointer-events-none"
      />
    </button>
  );
}
