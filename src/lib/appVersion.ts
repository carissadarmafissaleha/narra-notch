import pkg from "../../package.json";

/**
 * Version of the web bundle this build shipped with. The iOS/PWA companion
 * reports it to the desktop so Settings can show a real phone version instead
 * of guessing. Both app and phone are released together, but an old IPA keeps
 * reporting its own (older) number, which is exactly what we want to surface.
 */
export const APP_VERSION: string = pkg.version;
