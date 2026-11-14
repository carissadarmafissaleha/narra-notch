export type HudType =
  | "volume"
  | "brightness"
  | "capslock"
  | "language"
  | "battery"
  | "wifi"
  | "bluetooth";

export interface HudPayload {
  type: HudType;
  title: string;
  value?: number; // 0..100 (for volume, brightness, battery)
  label: string;
  sublabel?: string;
  iconName?: string;
}

export interface HudState extends HudPayload {
  active: boolean;
}
