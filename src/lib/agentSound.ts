import { settings } from "../settings/store";

let isAudioUnlocked = false;
let sharedAudioContext: AudioContext | null = null;
const audioCache = new Map<string, HTMLAudioElement>();

/**
 * Mobile iOS Safari & Chrome require a user touch or click gesture
 * before any Audio / AudioContext can be played asynchronously via SSE.
 */
export function unlockMobileAudio() {
  if (isAudioUnlocked) return;
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass && !sharedAudioContext) {
      sharedAudioContext = new AudioContextClass();
    }
    if (sharedAudioContext && sharedAudioContext.state === "suspended") {
      void sharedAudioContext.resume();
    }

    // Play a tiny silent buffer / data URI to unlock HTMLAudioElement
    const silentAudio = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA",
    );
    silentAudio.volume = 0.01;
    silentAudio
      .play()
      .then(() => {
        isAudioUnlocked = true;
      })
      .catch(() => {});
  } catch {}
}

if (typeof window !== "undefined") {
  window.addEventListener("touchstart", unlockMobileAudio, { once: true, passive: true });
  window.addEventListener("click", unlockMobileAudio, { once: true, passive: true });
}

function getVolume(): number {
  const s = settings.get();
  if (s.codingAgent && !s.codingAgent.soundEnabled) return 0;
  return s.codingAgent ? s.codingAgent.soundVolume : 0.6;
}

let lastAnySoundTime = 0;
let lastSoundName = "";
let currentActiveAudio: HTMLAudioElement | null = null;

/** Play authentic Coucou WAV sound with graceful fallback, anti-overlap & mobile unlocking */
export function playCoucouSound(name: string, volumeScale = 1.0) {
  const vol = getVolume();
  if (vol <= 0) return;

  const now = Date.now();
  // Prevent duplicate sound triggers from multiple listeners
  if (name === lastSoundName && now - lastAnySoundTime < 900) return;
  // Prevent rapid clashing sounds unless it's a direct user poke or urgent approval
  if (name !== "pop" && name !== "approval" && now - lastAnySoundTime < 450) return;

  lastAnySoundTime = now;
  lastSoundName = name;

  try {
    // Stop any currently playing audio so sounds never clash/overlap
    if (currentActiveAudio && !currentActiveAudio.paused) {
      currentActiveAudio.pause();
      currentActiveAudio.currentTime = 0;
    }

    let audio = audioCache.get(name);
    if (!audio) {
      audio = new Audio(`/sounds/${name}.wav`);
      audioCache.set(name, audio);
    } else {
      audio.currentTime = 0;
    }
    audio.volume = Math.min(1, Math.max(0, vol * volumeScale));
    currentActiveAudio = audio;
    const promise = audio.play();
    if (promise !== undefined) {
      promise.catch(() => {
        // Autoplay policy fallback: try unlocking and retry once
        unlockMobileAudio();
      });
    }
  } catch {
    // Fallback if Audio fails
  }
}

let lastToolSoundTime = 0;
const TOOL_SOUND_DEBOUNCE_MS = 2500;

/**
 * Filtered sound player according to user rules:
 * - Only: start, edit, bash, done.
 * - 'read' is never played (read gak usah).
 * - Debounced & tuned volume to prevent noisy spam.
 */
export function playAgentSound(action: "start" | "edit" | "bash" | "done" | "read") {
  if (action === "read") return;

  const now = Date.now();
  if (action === "start") {
    playCoucouSound("greet", 0.5);
  } else if (action === "done") {
    playFinishSound();
  } else if (action === "edit") {
    if (now - lastToolSoundTime > TOOL_SOUND_DEBOUNCE_MS) {
      lastToolSoundTime = now;
      playCoucouSound("work", 0.42);
    }
  } else if (action === "bash") {
    if (now - lastToolSoundTime > TOOL_SOUND_DEBOUNCE_MS) {
      lastToolSoundTime = now;
      playCoucouSound("send", 0.42);
    }
  }
}

/** Cute "Pop" bubble sound when clicking Mochi */
export function playMochiPoke() {
  playCoucouSound("pop");
}

/** Authentic "Coucou !" greeting sound */
export function playGreetingSound() {
  playCoucouSound("greet");
}

/** Approval request chime */
export function playApprovalAlert() {
  playCoucouSound("approval");
}

/** Positive success sound */
export function playSuccessSound() {
  playCoucouSound("approve");
}

/** Finish turn chime */
export function playFinishSound() {
  playCoucouSound("finish");
}

/** Soft error / denied sound */
export function playDeniedSound() {
  playCoucouSound("error");
}
