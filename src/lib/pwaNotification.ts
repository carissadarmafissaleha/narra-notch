/**
 * Cross-platform PWA & Native iOS notification helper.
 * Supports:
 * 1. Capacitor Native iOS Local Notifications (UNUserNotificationCenter banner + sound)
 * 2. Native OS Web Notifications & Service Worker Notifications (when origin & device support it)
 * 3. Mobile Haptic Vibration (navigator.vibrate)
 *
 * No in-app floating banner: the PWA relies on real system notifications only,
 * so approval alerts never cover the Mochi UI.
 */

import { LocalNotifications } from "@capacitor/local-notifications";
import { t } from "../i18n";

let swRegistration: ServiceWorkerRegistration | null = null;

const APPROVAL_ACTION_TYPE = "APPROVAL";
let actionTypesReady = false;

/**
 * iOS/Android show notification buttons when the user pulls the banner down.
 * They are registered once per app start and referenced by `actionTypeId`.
 */
async function registerApprovalActions(): Promise<void> {
  if (actionTypesReady) return;
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: APPROVAL_ACTION_TYPE,
          actions: [
            { id: "allow", title: t("Allow") },
            { id: "always", title: t("Always") },
            { id: "deny", title: t("Deny"), destructive: true },
          ],
        },
      ],
    });
    actionTypesReady = true;
  } catch {
    // Web/PWA: no native action buttons, the in-app card still works.
  }
}

export type ApprovalNotificationDecision = "allow" | "always" | "deny";

/**
 * Listen for the notification buttons. Returns a disposer, or a no-op when the
 * platform has no native notifications.
 */
export async function onApprovalNotificationAction(
  handler: (approvalId: string, decision: ApprovalNotificationDecision) => void,
): Promise<() => void> {
  try {
    const handle = await LocalNotifications.addListener(
      "localNotificationActionPerformed",
      (event) => {
        const approvalId = event?.notification?.extra?.approvalId;
        const decision = event?.actionId;
        if (typeof approvalId !== "string" || !approvalId) return;
        if (decision !== "allow" && decision !== "always" && decision !== "deny") return;
        handler(approvalId, decision);
      },
    );
    return () => {
      void handle.remove();
    };
  } catch {
    return () => {};
  }
}

export function triggerDeviceVibration(pattern: number[] = [150, 80, 150]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {}
  }
}

export async function initPwaNotifications(): Promise<void> {
  // 1. Auto-request Capacitor native permissions on startup
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display === "prompt" || perm.display === "prompt-with-rationale") {
      await LocalNotifications.requestPermissions();
    }
  } catch {}

  // Create notification channel for Android (required for Android 8+)
  try {
    await LocalNotifications.createChannel({
      id: "approvals",
      name: "Agent Approvals",
      description: "Permission approval requests from Coding Agent",
      importance: 5, // High importance
      visibility: 1, // Public on lockscreen
      sound: "default",
      vibration: true,
    });
  } catch {}

  // 2. Register the Allow / Always / Deny buttons once per app start
  await registerApprovalActions();

  // 2. Service worker registration
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    swRegistration = reg;
  } catch (err) {
    console.warn("[pwa] Service worker registration:", err);
  }
}

export function isNotificationSupported(): boolean {
  return true;
}

export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return "denied";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  // 1. Try Capacitor Native iOS request first
  try {
    const res = await LocalNotifications.requestPermissions();
    if (res.display === "granted") return "granted";
    if (res.display === "denied") return "denied";
  } catch {}

  // 2. Fallback to Web Notification API
  if (!isNotificationSupported()) return "denied";

  try {
    const perm = await Notification.requestPermission();
    return perm;
  } catch {
    return "denied";
  }
}

export type PwaNotificationOptions = NotificationOptions & {
  renotify?: boolean;
  tag?: string;
  badge?: string;
  toastType?: "approval" | "finish" | "info";
  /** Which approval this banner belongs to, so its buttons can answer it. */
  approvalId?: string;
  /** iOS sound name; defaults to the system sound for approval banners. */
  sound?: string;
};

/**
 * Shows a real system notification (native iOS banner first, then Web Notification).
 * Returns true when a system banner was actually scheduled/shown, so callers can
 * avoid playing a second in-app alert sound on top of the system one.
 */
export async function sendPwaNotification(
  title: string,
  options?: PwaNotificationOptions,
): Promise<boolean> {
  // 1. Always trigger device vibration on mobile
  triggerDeviceVibration(options?.toastType === "approval" ? [200, 100, 200] : [150, 80]);

  // 2. Try Capacitor Native iOS Local Notification (banners, lock screen, sounds)
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      perm = await LocalNotifications.requestPermissions();
    }
    if (perm.display === "granted") {
      const approval = options?.toastType === "approval" ? options?.approvalId : undefined;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 100000) + 1,
            title,
            body: (options?.body as string) || "Narra-Notch Notification",
            // Without an explicit sound iOS delivers the banner silently.
            sound: options?.sound ?? "default",
            channelId: "approvals",
            schedule: { at: new Date(Date.now() + 200) },
            ...(approval
              ? { actionTypeId: APPROVAL_ACTION_TYPE, extra: { approvalId: approval } }
              : {}),
          },
        ],
      });
      return true;
    }
  } catch (err) {
    console.warn("[LocalNotifications error]", err);
  }

  // 3. Try Native OS Web / Service Worker Notification if supported & granted
  if (isNotificationSupported() && Notification.permission === "granted") {
    const defaultOptions: PwaNotificationOptions = {
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      ...options,
    };

    if ("serviceWorker" in navigator) {
      try {
        const reg = swRegistration || (await navigator.serviceWorker.ready);
        if (reg && reg.showNotification) {
          await reg.showNotification(title, defaultOptions as NotificationOptions);
          return true;
        }
      } catch {}
    }

    try {
      new Notification(title, defaultOptions);
      return true;
    } catch {}
  }

  return false;
}
