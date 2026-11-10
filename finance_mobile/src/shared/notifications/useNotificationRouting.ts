import { useEffect, useRef } from "react";
import { router } from "expo-router";

import { safeRoute } from "../utils/notificationPrefs";
import { loadNotifications } from "./native";

type Response = import("expo-notifications").NotificationResponse;

/**
 * Ouvre l'écran indiqué par la notification touchée (application ouverte, en arrière-plan
 * ou fermée). `enabled` doit rester faux tant que la navigation n'est pas prête
 * (session non vérifiée, écran de démarrage), pour ne pas être écrasé par la redirection.
 * Sans module de notifications dans le build, ce hook ne fait rien.
 */
export function useNotificationRouting(enabled: boolean): void {
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const Notifications = loadNotifications();
    if (!Notifications) return;

    const open = (response: Response | null) => {
      if (!response) return;
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const id = response.notification.request.identifier;
      if (handled.current === id) return; // une notification n'ouvre l'écran qu'une fois
      handled.current = id;
      const route = safeRoute(response.notification.request.content.data?.route);
      if (route) router.push(route);
    };

    /* Notification touchée alors que l'application était fermée. */
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    /* Notification touchée application ouverte ou en arrière-plan. */
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [enabled]);
}
