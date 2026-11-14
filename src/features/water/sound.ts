/*
 * Gentle water droplet chime synthesized via WebAudio API.
 * Produces a crisp, organic water drop followed by a soft harmonic chime.
 */

let ctx: AudioContext | null = null;

export function playGentleWaterChime(volume = 0.7): () => void {
  try {
    ctx ??= new AudioContext();
    const c = ctx;
    void c.resume();

    const master = c.createGain();
    master.gain.value = Math.max(0, Math.min(1, volume)) * 0.45;
    master.connect(c.destination);

    const now = c.currentTime + 0.03;

    // 1. Water drop effect (quick upward frequency sweep)
    const dropOsc = c.createOscillator();
    const dropGain = c.createGain();

    dropOsc.type = "sine";
    dropOsc.frequency.setValueAtTime(600, now);
    dropOsc.frequency.exponentialRampToValueAtTime(1400, now + 0.08);

    dropGain.gain.setValueAtTime(0, now);
    dropGain.gain.linearRampToValueAtTime(0.4, now + 0.015);
    dropGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    dropOsc.connect(dropGain);
    dropGain.connect(master);

    dropOsc.start(now);
    dropOsc.stop(now + 0.14);

    // 2. Secondary soft resonance ring (harmonic glass / water crystal resonance)
    const ringOsc = c.createOscillator();
    const ringGain = c.createGain();

    ringOsc.type = "sine";
    ringOsc.frequency.setValueAtTime(1056, now + 0.06);

    ringGain.gain.setValueAtTime(0, now + 0.06);
    ringGain.gain.linearRampToValueAtTime(0.25, now + 0.09);
    ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    ringOsc.connect(ringGain);
    ringGain.connect(master);

    ringOsc.start(now + 0.06);
    ringOsc.stop(now + 1.25);

    return () => {
      try {
        master.gain.setValueAtTime(0, c.currentTime);
        dropOsc.stop();
        ringOsc.stop();
      } catch {
        // already stopped
      }
    };
  } catch {
    return () => {};
  }
}
