import { overrideApiUrl } from "../api/baseUrl";
import { hasFirebaseNative } from "./firebaseNative";

type RemoteConfigModule = typeof import("@react-native-firebase/remote-config");

/** Clés lues dans Firebase Remote Config. */
export const REMOTE_KEYS = {
  apiBaseUrl: "api_base_url",
} as const;

const FETCH_INTERVAL_MS = __DEV__ ? 0 : 60 * 60 * 1000;

let mod: RemoteConfigModule | null | undefined;

/** Module natif chargé à la demande : un build qui ne le contient pas garde l'adresse embarquée. */
function load(): RemoteConfigModule | null {
  if (mod !== undefined) return mod;
  if (!hasFirebaseNative("Config")) {
    mod = null;
    return mod;
  }
  try {
    mod = require("@react-native-firebase/remote-config") as RemoteConfigModule;
    mod.getRemoteConfig(); // échoue si le module natif est absent du binaire
  } catch (error) {
    console.warn("Firebase Remote Config indisponible dans ce build :", error);
    mod = null;
  }
  return mod;
}

function apply(m: RemoteConfigModule): void {
  const rc = m.getRemoteConfig();
  overrideApiUrl(m.getValue(rc, REMOTE_KEYS.apiBaseUrl).asString());
}

/**
 * À appeler au démarrage, avant les premières requêtes :
 * 1. active les valeurs reçues lors d'un lancement précédent (local, rapide) ;
 * 2. va chercher les nouvelles valeurs en arrière-plan (au plus une fois par heure)
 *    et les applique dès réception, pour les requêtes suivantes.
 * Ne lève jamais : sans réseau ou sans Firebase, l'adresse actuelle est conservée.
 */
export async function initRemoteConfig(): Promise<void> {
  const m = load();
  if (!m) return;
  const rc = m.getRemoteConfig();
  try {
    // API modulaire v27 (comme le SDK web) : valeurs par défaut et réglages sont des propriétés.
    rc.defaultConfig = { [REMOTE_KEYS.apiBaseUrl]: "" };
    rc.settings = { ...rc.settings, minimumFetchIntervalMillis: FETCH_INTERVAL_MS, fetchTimeoutMillis: 10_000 };
    await m.activate(rc);
    apply(m);
  } catch (error) {
    console.warn("Remote Config : valeurs locales indisponibles :", error);
  }
  void m
    .fetchAndActivate(rc)
    .then(() => apply(m))
    .catch((error: unknown) => console.warn("Remote Config : récupération impossible :", error));

  try {
    m.onConfigUpdate(rc, {
      next: () => {
        void m.activate(rc).then(() => apply(m)).catch(() => undefined);
      },
      error: (error) => console.warn("Remote Config : écoute temps réel interrompue :", error),
      complete: () => undefined,
    });
  } catch (error) {
    console.warn("Remote Config : temps réel indisponible :", error);
  }
}
