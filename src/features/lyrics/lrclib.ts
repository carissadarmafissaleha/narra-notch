import type { LyricLine, LyricsData } from "./types";

/**
 * Cleans track titles from browser/YouTube/Spotify noise
 * (e.g. "Song Name (Official Music Video)", "Artist - Title", "Artist - Topic", etc.)
 */
const GENERIC_ARTISTS = ["youtube", "youtube music", "chrome", "msedge", "firefox", "brave", "edge", "safari"];

/** Browser/YouTube sessions often report the player app as the artist; it is useless for lookup. */
export function isGenericArtist(artist: string): boolean {
  return GENERIC_ARTISTS.includes(artist.trim().toLowerCase());
}

export function cleanTrackInfo(rawTitle: string, rawArtist: string): { title: string; artist: string } {
  let title = rawTitle.trim();
  let artist = rawArtist.trim();

  // Strip YouTube / VEVO suffixes from artist
  artist = artist
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .trim();

  // If artist is generic like "YouTube" or empty and title contains " - "
  if (
    (!artist ||
      artist.toLowerCase() === "youtube" ||
      artist.toLowerCase() === "youtube music" ||
      artist.toLowerCase() === "chrome" ||
      artist.toLowerCase() === "msedge" ||
      artist.toLowerCase() === "firefox" ||
      artist.toLowerCase() === "brave") &&
    title.includes(" - ")
  ) {
    const parts = title.split(" - ");
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }
  }

  // Remove parentheses / brackets with official tags, feat. credits, remaster/deluxe noise
  title = title
    .replace(/\[\s*(official\s*(music\s*|lyric\s*)?video|official\s*audio|lyrics?\s*(video)?|visualizer|mv|hd|4k|audio|explicit|clean|deluxe|bonus|remaster(ed)?)\s*\]/gi, "")
    .replace(/\(\s*(official\s*(music\s*|lyric\s*)?video|official\s*audio|lyrics?\s*(video)?|visualizer|mv|hd|4k|audio|explicit|clean|deluxe|bonus|remaster(ed)?)\s*\)/gi, "")
    .replace(/\(\s*(?:feat|ft|with|prod)\.?[^)]*\)/gi, "")
    .replace(/\[\s*(?:feat|ft|with|prod)\.?[^\]]*\]/gi, "")
    .replace(/\s*-\s*(remastered|live|radio edit|acoustic|sped up|slowed|single|ep|album version|original mix).*/gi, "")
    .replace(/\s*\((remastered|live|radio edit|acoustic|sped up|slowed|single|ep|album version|original mix).*\)/gi, "")
    .replace(/\s*ft\.?\s+.*$/gi, "")
    .replace(/\s*feat\.?\s+.*$/gi, "")
    .trim();

  // If primary artist has multiple comma/feat artists, take main artist for cleaner lookup
  artist = artist
    .replace(/\s*(?:feat|ft)\.?.*$/i, "")
    .split(",")[0]
    .trim();

  return { title, artist };
}

/**
 * Parses LRC format strings: "[mm:ss.xx] Lyric text" into sorted LyricLine array.
 * Correctly accounts for [offset:+/-ms] tag when present.
 */
export function parseLrc(lrcText: string): LyricLine[] {
  const lines = lrcText.split(/\r?\n/);
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  // Extract [offset:+/-ms] tag (standard LRC overall adjustment in milliseconds)
  let offsetSec = 0;
  const offsetMatch = lrcText.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  if (offsetMatch) {
    const offsetMs = parseInt(offsetMatch[1], 10);
    if (!isNaN(offsetMs)) {
      offsetSec = offsetMs / 1000;
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const matches = [...trimmed.matchAll(timeRegex)];
    if (matches.length === 0) continue;

    // Remove all time tags to get text (empty text is kept as an instrumental marker)
    const text = trimmed.replace(timeRegex, "").trim();

    for (const match of matches) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const millis = match[3] ? parseInt(match[3].padEnd(3, "0").slice(0, 3), 10) : 0;
      const totalSeconds = Math.max(0, minutes * 60 + seconds + millis / 1000 + offsetSec);

      result.push({
        time: totalSeconds,
        text,
      });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

// In-memory lyrics cache
const lyricsCache = new Map<string, LyricsData | null>();
const inflightRequests = new Map<string, Promise<LyricsData | null>>();

function scoreCandidate(item: any, title: string, artist: string, duration?: number): number {
  let score = 0;
  if (item.syncedLyrics) score += 200;
  if (item.plainLyrics) score += 20;

  const itemArtist = (item.artistName || "").toLowerCase().trim();
  const searchArtist = artist.toLowerCase().trim();
  if (itemArtist && searchArtist) {
    if (itemArtist === searchArtist) score += 100;
    else if (itemArtist.includes(searchArtist) || searchArtist.includes(itemArtist)) score += 60;
  }

  const itemTitle = (item.trackName || "").toLowerCase().trim();
  const searchTitle = title.toLowerCase().trim();
  if (itemTitle && searchTitle) {
    if (itemTitle === searchTitle) score += 80;
    else if (itemTitle.includes(searchTitle) || searchTitle.includes(itemTitle)) score += 40;
  }

  if (duration && duration > 0 && item.duration && item.duration > 0) {
    const diff = Math.abs(item.duration - duration);
    if (diff <= 2) score += 60;
    else if (diff <= 5) score += 40;
    else if (diff <= 10) score += 20;
    else if (diff > 30) score -= 30;
  }

  return score;
}

export function setCachedLyrics(title: string, artist: string, data: LyricsData) {
  const cleaned = cleanTrackInfo(title, artist);
  const cacheKey = `${cleaned.title.toLowerCase()}::${cleaned.artist.toLowerCase()}`;
  lyricsCache.set(cacheKey, data);
}

/**
 * Fetches lyrics from lrclib.net with multi-step fallback (get with duration, get without duration, structured search, text search).
 */
export async function fetchLyrics(
  title: string,
  artist: string,
  duration?: number
): Promise<LyricsData | null> {
  const cleaned = cleanTrackInfo(title, artist);
  if (!cleaned.title) return null;

  const cacheKey = `${cleaned.title.toLowerCase()}::${cleaned.artist.toLowerCase()}::${Math.round(duration || 0)}`;

  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey) ?? null;
  }

  const existing = inflightRequests.get(cacheKey);
  if (existing) return existing;

  const promise = (async (): Promise<LyricsData | null> => {
    let plainFallback: LyricsData | null = null;

    try {
      const hasArtist = Boolean(cleaned.artist && !isGenericArtist(cleaned.artist));

      // 1. Try exact match via /api/get with duration (if duration known)
      if (hasArtist && duration && duration > 10) {
        try {
          const getParams = new URLSearchParams({
            track_name: cleaned.title,
            artist_name: cleaned.artist,
            duration: String(Math.round(duration)),
          });
          const getRes = await fetch(`https://lrclib.net/api/get?${getParams.toString()}`);
          if (getRes.ok) {
            const data = await getRes.json();
            const synced = data.syncedLyrics ? parseLrc(data.syncedLyrics) : null;
            const candidate: LyricsData = {
              id: cacheKey,
              trackName: data.trackName || cleaned.title,
              artistName: data.artistName || cleaned.artist,
              synced: synced && synced.length > 0 ? synced : null,
              plain: data.plainLyrics || null,
            };
            if (candidate.synced && candidate.synced.length > 0) {
              lyricsCache.set(cacheKey, candidate);
              return candidate;
            }
            if (candidate.plain) plainFallback = candidate;
          }
        } catch {}
      }

      // 2. Try exact match via /api/get WITHOUT duration (duration might differ by 3-5s due to silence)
      if (hasArtist) {
        try {
          const getParams = new URLSearchParams({
            track_name: cleaned.title,
            artist_name: cleaned.artist,
          });
          const getRes = await fetch(`https://lrclib.net/api/get?${getParams.toString()}`);
          if (getRes.ok) {
            const data = await getRes.json();
            const synced = data.syncedLyrics ? parseLrc(data.syncedLyrics) : null;
            const candidate: LyricsData = {
              id: cacheKey,
              trackName: data.trackName || cleaned.title,
              artistName: data.artistName || cleaned.artist,
              synced: synced && synced.length > 0 ? synced : null,
              plain: data.plainLyrics || null,
            };
            if (candidate.synced && candidate.synced.length > 0) {
              lyricsCache.set(cacheKey, candidate);
              return candidate;
            }
            if (candidate.plain && !plainFallback) plainFallback = candidate;
          }
        } catch {}
      }

      // 3. Fallback to /api/search with structured track_name & artist_name
      let searchItems: any[] = [];
      if (hasArtist) {
        try {
          const searchRes = await fetch(
            `https://lrclib.net/api/search?track_name=${encodeURIComponent(
              cleaned.title
            )}&artist_name=${encodeURIComponent(cleaned.artist)}`
          );
          if (searchRes.ok) {
            const items = await searchRes.json();
            if (Array.isArray(items)) searchItems = items;
          }
        } catch {}
      }

      // 4. Fallback to generic keyword search if structured search returned nothing
      if (searchItems.length === 0) {
        try {
          const query = hasArtist ? `${cleaned.title} ${cleaned.artist}`.trim() : cleaned.title;
          const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
          if (searchRes.ok) {
            const items = await searchRes.json();
            if (Array.isArray(items)) searchItems = items;
          }
        } catch {}
      }

      if (searchItems.length > 0) {
        // Score each candidate to pick the closest synced version matching artist, title, duration
        const scored = searchItems.map((item) => ({
          item,
          score: scoreCandidate(item, cleaned.title, cleaned.artist, duration),
        }));
        scored.sort((a, b) => b.score - a.score);
        const best = scored[0]?.item;

        if (best) {
          const synced = best.syncedLyrics ? parseLrc(best.syncedLyrics) : null;
          const lyricsData: LyricsData = {
            id: cacheKey,
            trackName: best.trackName || cleaned.title,
            artistName: best.artistName || cleaned.artist,
            synced: synced && synced.length > 0 ? synced : null,
            plain: best.plainLyrics || plainFallback?.plain || null,
          };
          lyricsCache.set(cacheKey, lyricsData);
          return lyricsData;
        }
      }

      if (plainFallback) {
        lyricsCache.set(cacheKey, plainFallback);
        return plainFallback;
      }

      lyricsCache.set(cacheKey, null);
      return null;
    } catch {
      return plainFallback;
    } finally {
      inflightRequests.delete(cacheKey);
    }
  })();

  inflightRequests.set(cacheKey, promise);
  return promise;
}
