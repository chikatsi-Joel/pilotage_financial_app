import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { notifications as api } from "../api/notifications";
import { deviceTimezone } from "../utils/notificationPrefs";

const TOKEN_KEY = "pilotage-push-token";

/** Une notification reçue pendant que l'application est ouverte s'affiche quand même. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushStatus = "granted" | "denied" | "unsupported" | "unavailable";

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Autorisation actuelle, sans rien demander à l'utilisateur. */
export async function pushPermission(): Promise<PushStatus> {
  if (!Device.isDevice) return "unsupported";
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted" ? "granted" : "denied";
}

/**
 * Demande l'autorisation si besoin, récupère le jeton Expo et l'enregistre côté serveur.
 * Ne lève jamais d'exception : l'absence de notifications ne doit pas bloquer l'application.
 */
export async function registerForPush(userId: string): Promise<PushStatus> {
  try {
    if (!Device.isDevice) return "unsupported"; // simulateur : pas de push

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Pilotage",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return "denied";

    const id = projectId();
    if (!id) {
      console.warn("Notifications : projectId EAS introuvable (lancez `eas init`).");
      return "unavailable";
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await api.registerDevice(userId, {
      token,
      platform: Platform.OS,
      timezone: deviceTimezone(),
    });
    await SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => undefined);
    return "granted";
  } catch (error) {
    console.warn("Notifications : enregistrement impossible", error);
    return "unavailable";
  }
}

/** À la déconnexion : l'appareil ne doit plus recevoir les notifications de ce compte. */
export async function unregisterPush(userId: string): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) await api.unregisterDevice(userId, token);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Hors ligne : le serveur retirera l'appareil quand Expo le signalera inactif.
  }
}
