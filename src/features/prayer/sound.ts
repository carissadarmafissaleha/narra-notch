/*
 * Gentle prayer reminder sound synthesized via WebAudio API.
 * Uses warm harmonics and soft decay to produce a peaceful, meditative chime.
 */

let ctx: AudioContext | null = null;

export function playGentlePrayerChime(volume = 0.7): () => void {
  try {
    ctx ??= new AudioContext();
    const c = ctx;
    void c.resume();

    const master = c.createGain();
    // Soft master gain so it is gentle and not jarring
    master.gain.value = Math.max(0, Math.min(1, volume)) * 0.45;
    master.connect(c.destination);

    const now = c.currentTime + 0.05;

    // Harmonic bell notes: 528Hz (warm tone), 792Hz (fifth), 1056Hz (octave)
    const notes = [
      { freq: 528, at: 0, decay: 4.2, gain: 0.8 },
      { freq: 792, at: 0.12, decay: 3.8, gain: 0.5 },
      { freq: 1056, at: 0.28, decay: 3.5, gain: 0.4 },
      // Soft secondary echo chime
      { freq: 660, at: 1.2, decay: 4.0, gain: 0.6 },
      { freq: 990, at: 1.35, decay: 3.6, gain: 0.4 },
    ];

    const activeOscs: OscillatorNode[] = [];

    for (const note of notes) {
      const t = now + note.at;

      // Base sine oscillator for fundamental warmth
      const osc = c.createOscillator();
      const gain = c.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, t);

      // Soft attack to prevent click/pop, followed by exponential decay
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(note.gain * 0.35, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + note.decay);

      osc.connect(gain);
      gain.connect(master);

      osc.start(t);
      osc.stop(t + note.decay + 0.1);
      activeOscs.push(osc);

      // Add a subtle subtle harmonic overtone for natural acoustic shimmer
      const overtone = c.createOscillator();
      const overtoneGain = c.createGain();
      overtone.type = "triangle";
      overtone.frequency.setValueAtTime(note.freq * 2.76, t);

      overtoneGain.gain.setValueAtTime(0, t);
      overtoneGain.gain.linearRampToValueAtTime(note.gain * 0.06, t + 0.02);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, t + note.decay * 0.7);

      overtone.connect(overtoneGain);
      overtoneGain.connect(master);

      overtone.start(t);
      overtone.stop(t + note.decay * 0.7 + 0.1);
      activeOscs.push(overtone);
    }

    return () => {
      try {
        for (const osc of activeOscs) {
          osc.stop();
          osc.disconnect();
        }
      } catch {
        // already stopped
      }
    };
  } catch {
    return () => {};
  }
}
