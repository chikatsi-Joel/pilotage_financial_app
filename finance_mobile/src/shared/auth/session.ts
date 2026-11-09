import * as SecureStore from "expo-secure-store";

const KEY = "pilotage-auth-token";

let cached: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Charge le jeton depuis le stockage sécurisé (à appeler une fois au démarrage). */
export async function loadToken(): Promise<string | null> {
  try {
    cached = await SecureStore.getItemAsync(KEY);
  } catch {
    cached = null;
  }
  return cached;
}

/** Jeton en mémoire, lu par l'intercepteur axios. */
export function getToken(): string | null {
  return cached;
}

export async function saveToken(token: string): Promise<void> {
  cached = token;
  try {
    await SecureStore.setItemAsync(KEY, token);
  } catch {
    // La session reste valable en mémoire ; elle sera redemandée au prochain démarrage.
  }
}

export async function clearToken(): Promise<void> {
  cached = null;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Rien à supprimer.
  }
}

/** Callback appelé quand le serveur répond 401 (session révoquée ou invalide). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export function notifyUnauthorized(): void {
  onUnauthorized?.();
}
