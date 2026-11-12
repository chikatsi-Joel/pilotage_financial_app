import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { notifications as api } from "../api/notifications";
import { deviceTimezone } from "../utils/notificationPrefs";
import { loadDevice, loadNotifications } from "./native";

const TOKEN_KEY = "pilotage-push-token";

export type PushStatus = "granted" | "denied" | "unsupported" | "unavailable";

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Autorisation actuelle, sans rien demander à l'utilisateur. */
export async function pushPermission(): Promise<PushStatus> {
  const Notifications = loadNotifications();
  const Device = loadDevice();
  if (!Notifications || !Device) return "unavailable";
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
    const Notifications = loadNotifications();
    const Device = loadDevice();
    if (!Notifications || !Device) return "unavailable";
    if (!Device.isDevice) return "unsupported"; // simulateur : pas de push

    if (Platform.OS === "android") {
      // Une catégorie par type : visible dans l'en-tête et réglable séparément dans Android.
      const channels: Array<[string, string, string, number]> = [
        ["budget", "Alertes budget", "Dépassements et rythme de dépense", Notifications.AndroidImportance.HIGH],
        ["savings", "Épargne", "Objectifs atteints et rappels de versement", Notifications.AndroidImportance.DEFAULT],
        ["reminders", "Rappels", "Rappel quotidien de saisie", Notifications.AndroidImportance.DEFAULT],
        ["summaries", "Résumés", "Résumé et conseil de la semaine", Notifications.AndroidImportance.LOW],
        ["default", "Général", "Autres notifications Lucia", Notifications.AndroidImportance.DEFAULT],
      ];
      for (const [id, name, description, importance] of channels) {
        await Notifications.setNotificationChannelAsync(id, {
          name,
          description,
          importance,
          lightColor: "#584CB9",
        });
      }
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
