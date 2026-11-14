/*
 * Mobile companion (PWA / Android / iOS) light-dark switch.
 *
 * The desktop notch is always pure black, so this only ever touches the phone
 * shell. The choice is stored apart from the notch settings on purpose: the
 * companion is a separate install and has no Settings page of its own yet.
 */

export type MobileTheme = "dark" | "light" | "auto";

const STORAGE_KEY = "notch:mobile-theme";
const LIGHT_BG = "#EEF1F8";
const DARK_BG = "#000000";

/** Saved choice, or dark (the original look) on first open. */
export function getMobileTheme(): MobileTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "auto") return raw;
    return "dark";
  } catch {
    return "dark";
  }
}

export function resolveMobileTheme(theme: MobileTheme): "light" | "dark" {
  if (theme === "auto") {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    return "dark";
  }
  return theme;
}

export function saveMobileTheme(theme: MobileTheme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode / quota: the session still switches, it just won't persist.
  }
}

/**
 * Applies the theme to the document chrome: page background, the PWA
 * `theme-color` meta tag and the iOS status bar style. The CSS overrides are
 * scoped under `.mobile-light` in global.css.
 */
export function applyMobileTheme(theme: MobileTheme) {
  const resolved = resolveMobileTheme(theme);
  const light = resolved === "light";
  const color = light ? LIGHT_BG : DARK_BG;

  document.documentElement.classList.toggle("mobile-light", light);
  document.documentElement.style.colorScheme = light ? "light" : "dark";
  document.documentElement.style.backgroundColor = color;
  document.body.style.backgroundColor = color;

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", color);
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute("content", light ? "default" : "black-translucent");
}
