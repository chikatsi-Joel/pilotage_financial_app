import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

import { safeRoute } from "../utils/notificationPrefs";

/**
 * Ouvre l'écran indiqué par la notification touchée (application ouverte, en arrière-plan
 * ou fermée). `enabled` doit rester faux tant que la navigation n'est pas prête
 * (session non vérifiée, écran de démarrage), pour ne pas être écrasé par la redirection.
 */
export function useNotificationRouting(enabled: boolean): void {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return; // une notification n'ouvre l'écran qu'une fois
    handled.current = id;
    const route = safeRoute(response.notification.request.content.data?.route);
    if (route) router.push(route);
  }, [enabled, response]);
}
