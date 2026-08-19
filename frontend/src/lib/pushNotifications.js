import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";

let isCapacitor = Capacitor.isNativePlatform();

/**
 * Request notification permissions from device/browser
 */
export async function requestNotificationPermission() {
  try {
    if (isCapacitor) {
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== "granted") {
        await LocalNotifications.requestPermissions();
      }
    } else if ("Notification" in window) {
      if (Notification.permission === "default") {
        await Notification.requestPermission();
      }
    }
  } catch (err) {
    console.warn("Could not request notification permission:", err);
  }
}

/**
 * Display a device/browser pop-up banner notification
 */
export async function triggerLocalNotification(title, body, id = Date.now()) {
  try {
    if (isCapacitor) {
      const status = await LocalNotifications.checkPermissions();
      if (status.display === "granted") {
        await LocalNotifications.schedule({
          notifications: [
            {
              title: title || "GestionaleHera",
              body: body || "Hai una nuova notifica",
              id: id % 2147483647,
              schedule: { at: new Date(Date.now() + 100) },
              sound: undefined,
              smallIcon: "ic_launcher_foreground",
            },
          ],
        });
      }
    } else if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title || "GestionaleHera", {
        body: body || "Hai una nuova notifica",
        icon: "/favicon.ico",
      });
    }
  } catch (err) {
    console.warn("Could not trigger local notification:", err);
  }
}
