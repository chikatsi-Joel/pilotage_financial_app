import { router } from "expo-router";

import { auth } from "../api/auth";
import { forgetPushToken, unregisterPush } from "../notifications/push";
import { useAppStore } from "../store";
import { firebaseDeleteCurrentUser, firebaseSignOut } from "./firebase";
import { clearToken } from "./session";

/** Termine la session locale et renvoie vers l'écran de connexion. */
export async function endLocalSession(): Promise<void> {
  await clearToken();
  await firebaseSignOut();
  useAppStore.getState().clearAuth();
  // Ferme d'abord les écrans empilés (Paramètres, suppression du compte, écran profond lors
  // d'une session expirée) : sinon `replace` ne remplace que le sommet et les onglets restent
  // dessous, accessibles par le bouton retour alors que l'utilisateur est déconnecté.
  if (router.canDismiss()) router.dismissAll();
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

/**
 * Après la suppression du compte (le serveur a déjà tout effacé) : compte Firebase de
 * l'appareil, jeton push et données mises en cache sur le téléphone, puis écran de connexion.
 */
export async function endDeletedAccount(): Promise<void> {
  await firebaseDeleteCurrentUser();
  await forgetPushToken();
  await useAppStore.persist.clearStorage();
  await endLocalSession();
}
