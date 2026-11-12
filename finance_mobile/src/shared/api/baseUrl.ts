import Constants from "expo-constants";

import { parseApiUrl, type ApiUrls } from "../utils/apiUrl";

/** Serveur de Metro en développement : on vise le backend sur la même machine. */
const devHost = Constants.expoConfig?.hostUri?.split(":")[0];

const built: ApiUrls = devHost
  ? { api: `http://${devHost}:8000/api/v1`, origin: `http://${devHost}:8000` }
  : (parseApiUrl(process.env.EXPO_PUBLIC_API_URL) ?? {
      api: "http://localhost:8000/api/v1",
      origin: "http://localhost:8000",
    });

let current: ApiUrls = built;

/** Base des routes /api/v1 utilisée par chaque requête. */
export const apiBaseUrl = () => current.api;
/** Origine du serveur (healthcheck). */
export const apiOrigin = () => current.origin;

/**
 * Remplace l'adresse du serveur (valeur Remote Config). Une valeur vide ou invalide rétablit
 * l'adresse du build. Ignoré en développement : le backend local reste visé.
 * Renvoie true si l'adresse a changé.
 */
export function overrideApiUrl(raw: string | null | undefined): boolean {
  if (devHost) return false;
  const next = parseApiUrl(raw) ?? built;
  if (next.api === current.api) return false;
  current = next;
  return true;
}
