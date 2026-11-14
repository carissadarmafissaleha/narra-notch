import { playCoucouSound } from "../../../lib/agentSound";

// User rule: sound should only play when starting read, edit, bash, done, and confirmation (approval) only
const ALLOWED_SOUNDS = new Set([
  "search",    // mulai read
  "work",      // mulai edit
  "send",      // mulai bash
  "finish",    // done
  "approval",  // konfirmasi diminta
  "approve",   // konfirmasi diizinkan
  "error",     // konfirmasi ditolak
  "greet",     // sapaan coucou
  "slap",      // tepuk mochi
  "annoyed",   // marah / terganggu
  "dizzy",     // pusing
  "love",      // emote love
  "proud",     // emote bangga
  "wink",      // kedip
  "pop",       // poke
]);

export const Sound = {
  play: (name: string) => {
    if (ALLOWED_SOUNDS.has(name)) {
      playCoucouSound(name);
    }
  },
};
