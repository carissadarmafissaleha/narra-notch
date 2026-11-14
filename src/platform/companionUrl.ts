const URL_KEY = "narra:companion_server_url";
const TOKEN_KEY = "narra:companion_token";

export function getCompanionServerUrl(): string {
  if (typeof window === "undefined") return "";
  const stored = localStorage.getItem(URL_KEY);
  if (stored && stored.trim()) {
    return stored.trim().replace(/\/+$/, "");
  }

  // Capacitor / mobile: no saved URL yet → return empty. The UI then shows
  // "not connected" and asks for the PC's IP, instead of silently using a wrong default.
  return "";
}

export function setCompanionServerUrl(url: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem(URL_KEY, url.trim());
  }
}

/** Pairing code shown in the desktop Settings (Coding Agent → Handy koppeln). */
export function getCompanionToken(): string {
  if (typeof window === "undefined") return "";
  return (localStorage.getItem(TOKEN_KEY) ?? "").trim();
}

export function setCompanionToken(token: string) {
  if (typeof window === "undefined") return;
  const value = token.trim().toUpperCase();
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

/** 401 from a server that has a pairing code: the phone must be paired first. */
export class CompanionAuthError extends Error {
  constructor() {
    super("companion: pairing required");
    this.name = "CompanionAuthError";
  }
}

/**
 * `fetch` for the PC companion server. Adds the pairing token and turns a 401
 * into `CompanionAuthError`, so callers can ask for the code instead of showing
 * an empty screen. Works same-origin (PWA served by the server) and cross-origin
 * (iOS/Android app, where the base URL is the PC's IP).
 */
export async function companionFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getCompanionToken();
  if (token) headers.set("X-Narra-Token", token);

  const res = await fetch(`${getCompanionServerUrl()}${path}`, {
    ...init,
    headers,
  });
  if (res.status === 401) throw new CompanionAuthError();
  return res;
}

/**
 * URL for `EventSource`, which cannot send headers. The token rides in `?t=`,
 * so the server accepts the stream without weakening the gate.
 */
export function companionEventUrl(path: string): string {
  const base = `${getCompanionServerUrl()}${path}`;
  const token = getCompanionToken();
  if (!token) return base;
  return `${base}${path.includes("?") ? "&" : "?"}t=${encodeURIComponent(token)}`;
}
