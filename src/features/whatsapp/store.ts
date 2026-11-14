import { createStore } from "../../lib/store";
import { whatsappService } from "../../platform/services";

export interface RecentChat {
  phone: string;
  formatted: string;
  label?: string;
  lastUsed: number;
}

export interface WhatsAppState {
  countryCode: string;
  recentChats: RecentChat[];
  webActive: boolean;
  liveAlert: { title: string; subtitle: string; timestamp: number } | null;
}

const defaultState: WhatsAppState = {
  countryCode: "+62",
  recentChats: [],
  webActive: false,
  liveAlert: null,
};

export const whatsappStore = createStore<WhatsAppState>(defaultState, {
  persist: "whatsapp.v1",
});

/**
 * Format any user-entered phone number into standard international format without '+' or spaces.
 * E.g., '0812-3456-7890' with country code '+62' -> '6281234567890'.
 */
export function normalizePhone(raw: string, countryCode: string): string {
  let cleaned = raw.replace(/[^\d+]/g, "").trim();
  if (cleaned.startsWith("+")) {
    return cleaned.replace("+", "");
  }
  const cleanCode = countryCode.replace(/[^\d]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
  }
  if (!cleaned.startsWith(cleanCode)) {
    cleaned = cleanCode + cleaned;
  }
  return cleaned;
}

export async function openDirectWhatsApp(
  rawPhone: string,
  text: string = "",
  mode: "app" | "web" = "app",
  label?: string,
) {
  const s = whatsappStore.get();
  const phone = normalizePhone(rawPhone, s.countryCode);
  if (!phone || phone.length < 5) return;

  const encodedText = text.trim() ? encodeURIComponent(text.trim()) : "";
  const url =
    mode === "app"
      ? `whatsapp://send?phone=${phone}${encodedText ? `&text=${encodedText}` : ""}`
      : `https://web.whatsapp.com/send?phone=${phone}${encodedText ? `&text=${encodedText}` : ""}`;

  await whatsappService.openUrl(url);

  // Update recent list
  const existing = s.recentChats.filter((c) => c.phone !== phone);
  const updated: RecentChat = {
    phone,
    formatted: `+${phone}`,
    label: label?.trim() || undefined,
    lastUsed: Date.now(),
  };
  whatsappStore.set({
    ...s,
    recentChats: [updated, ...existing].slice(0, 8),
    liveAlert: {
      title: label || `+${phone}`,
      subtitle: text.trim() || "Chat WhatsApp",
      timestamp: Date.now(),
    },
  });

  // Clear live alert after 6 seconds
  setTimeout(() => {
    const cur = whatsappStore.get();
    if (cur.liveAlert && Date.now() - cur.liveAlert.timestamp >= 5500) {
      whatsappStore.set({ ...cur, liveAlert: null });
    }
  }, 6000);
}

export async function toggleWhatsAppWebWindow() {
  const isCurrentlyOpen = await whatsappService.isWebOpen();
  if (isCurrentlyOpen) {
    await whatsappService.closeWeb();
    whatsappStore.set((prev) => ({ ...prev, webActive: false }));
  } else {
    await whatsappService.openWeb();
    whatsappStore.set((prev) => ({ ...prev, webActive: true }));
  }
}

export async function closeWhatsAppWebWindow() {
  await whatsappService.closeWeb();
  whatsappStore.set((prev) => ({ ...prev, webActive: false }));
}

export async function syncWhatsAppWebStatus() {
  const isOpen = await whatsappService.isWebOpen();
  whatsappStore.set((prev) => ({ ...prev, webActive: isOpen }));
}

export function clearRecentChats() {
  whatsappStore.set((prev) => ({ ...prev, recentChats: [] }));
}

export function setWhatsAppCountryCode(code: string) {
  whatsappStore.set((prev) => ({ ...prev, countryCode: code }));
}
