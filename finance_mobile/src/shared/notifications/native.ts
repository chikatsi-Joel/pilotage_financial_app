type NotificationsModule = typeof import("expo-notifications");
type DeviceModule = typeof import("expo-device");

let notifications: NotificationsModule | null | undefined;
let device: DeviceModule | null | undefined;

/**
 * Charge `expo-notifications` à la demande.
 *
 * Importé en haut de fichier, un module natif absent du binaire installé (ancien build de
 * développement, Expo Go incompatible…) fait planter toute l'application au démarrage.
 * Chargé ici, il ne désactive que les notifications.
 */
export function loadNotifications(): NotificationsModule | null {
  if (notifications !== undefined) return notifications;
  try {
    const mod = require("expo-notifications") as NotificationsModule;
    /* Une notification reçue pendant que l'application est ouverte s'affiche quand même. */
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notifications = mod;
  } catch (error) {
    console.warn("Notifications indisponibles dans ce build :", error);
    notifications = null;
  }
  return notifications;
}

/** Même principe pour `expo-device`. */
export function loadDevice(): DeviceModule | null {
  if (device !== undefined) return device;
  try {
    device = require("expo-device") as DeviceModule;
  } catch (error) {
    console.warn("expo-device indisponible dans ce build :", error);
    device = null;
  }
  return device;
}
