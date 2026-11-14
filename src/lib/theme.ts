import type { Settings, ThemeColor } from "../settings/store";

/*
 * Notch theme: the body always stays pure black (it blends into the screen edge).
 * "monochrome" keeps every accent white; "color" swaps the accent (`--tint`) for
 * one hue. Components use `text-tint` / `bg-tint` / `var(--tint)`; the variable is
 * registered in global.css so a theme or color change crossfades instead of jumping.
 */

/** Dark-mode system hues (Apple-ish), tuned to read well on pure black. */
export const THEME_COLORS: Record<ThemeColor, string> = {
  blue: "#409cff",
  violet: "#a78bfa",
  pink: "#ff6fae",
  red: "#ff5c57",
  orange: "#ff9f43",
  yellow: "#ffd43b",
  green: "#3ddc84",
  teal: "#40d4d4",
};

export const THEME_COLOR_ORDER: ThemeColor[] = ["blue", "violet", "pink", "red", "orange", "yellow", "green", "teal"];

/** Label names (German keys, translated via t()). */
export const THEME_COLOR_LABEL: Record<ThemeColor, string> = {
  blue: "Blau",
  violet: "Violett",
  pink: "Pink",
  red: "Rot",
  orange: "Orange",
  yellow: "Gelb",
  green: "Grün",
  teal: "Türkis",
};

const WHITE = "#ffffff";

export function themeTint(s: Pick<Settings, "theme" | "themeColor">): string {
  return s.theme === "color" ? (THEME_COLORS[s.themeColor] ?? THEME_COLORS.blue) : WHITE;
}

/** Foreground on a solid tint fill (dark on bright hues, white never needed since mono = white fill). */
export const ON_TINT = "#000000";
