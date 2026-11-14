/*
 * Mobile companion (PWA / Android / iOS) light-dark switch.
 *
 * The desktop notch is always pure black, so this only ever touches the phone
 * shell. The choice is stored apart from the notch settings on purpose: the
 * companion is a separate install and has no Settings page of its own yet.
 */

export type MobileTheme = "dark" | "light";

const STORAGE_KEY = "notch:mobile-theme";
const LIGHT_BG = "#f2f2f7";
const DARK_BG = "#000000";

/** Saved choice, or dark (the original look) on first open. */
export function getMobileTheme(): MobileTheme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
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
  const light = theme === "light";
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
