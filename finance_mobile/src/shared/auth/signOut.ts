import { router } from "expo-router";

import { auth } from "../api/auth";
import { unregisterPush } from "../notifications/push";
import { useAppStore } from "../store";
import { firebaseSignOut } from "./firebase";
import { clearToken } from "./session";

/** Termine la session locale et renvoie vers l'écran de connexion. */
export async function endLocalSession(): Promise<void> {
  await clearToken();
  await firebaseSignOut();
  useAppStore.getState().clearAuth();
  router.replace("/onboarding");
}

/** Déconnexion volontaire : révoque la session côté serveur (au mieux) puis nettoie. */
export async function signOut(): Promise<void> {
  const userId = useAppStore.getState().userId;
  if (userId) await unregisterPush(userId);
  try {
    await auth.logout();
  } catch {
    // Hors ligne : la session locale est quand même fermée.
  }
  await endLocalSession();
}
