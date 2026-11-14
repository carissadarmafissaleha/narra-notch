export interface LyricLine {
  time: number; // in seconds
  text: string;
}

export interface LyricsData {
  id: string; // cache key: title-artist
  trackName: string;
  artistName: string;
  synced: LyricLine[] | null;
  plain: string | null;
}

export interface LyricsSettings {
  enabled: boolean;
  showInPill: boolean;
  /** Calibration offset in seconds (e.g. -0.5s or +0.5s) */
  syncOffset?: number;
}
