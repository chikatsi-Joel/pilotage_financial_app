import { overrideApiUrl } from "../api/baseUrl";
import { parseRemoteFlags } from "../utils/remoteFlags";
import { parseTours, parseTourVersion } from "../utils/tour";
import { hasFirebaseNative } from "./firebaseNative";
import { useRemoteFlags } from "./remoteFlags";

type RemoteConfigModule = typeof import("@react-native-firebase/remote-config");

/** Clés lues dans Firebase Remote Config. */
export const REMOTE_KEYS = {
  apiBaseUrl: "api_base_url",
  maintenanceEnabled: "maintenance_enabled",
  maintenanceMessage: "maintenance_message",
  announcementText: "announcement_text",
  announcementLink: "announcement_link",
  tourEnabled: "tour_enabled",
  tourVersion: "tour_version",
  tourSteps: "tour_steps",
} as const;

/** Valeurs embarquées : utilisées tant que Firebase n'a rien renvoyé. */
const DEFAULTS: Record<string, string> = Object.fromEntries(
  Object.values(REMOTE_KEYS).map((key) => [key, key === REMOTE_KEYS.maintenanceEnabled
      ? "false"
      : key === REMOTE_KEYS.tourEnabled
        ? "true"
        : key === REMOTE_KEYS.tourVersion
          ? "1"
          : ""]),
);

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
  const read = (key: string) => m.getValue(rc, key).asString();
  if (__DEV__) {
    // Diagnostic en développement : valeur reçue et origine (« remote », « default » ou « static »).
    const v = m.getValue(rc, REMOTE_KEYS.announcementText);
    console.log("[Remote Config] announcement_text =", JSON.stringify(v.asString()), "source:", v.getSource());
  }
  overrideApiUrl(read(REMOTE_KEYS.apiBaseUrl));
  const tourEnabled = read(REMOTE_KEYS.tourEnabled).trim().toLowerCase();
  useRemoteFlags.setState({
    ...parseRemoteFlags({
      maintenanceEnabled: read(REMOTE_KEYS.maintenanceEnabled),
      maintenanceMessage: read(REMOTE_KEYS.maintenanceMessage),
      announcementText: read(REMOTE_KEYS.announcementText),
      announcementLink: read(REMOTE_KEYS.announcementLink),
    }),
    tour: {
      enabled: tourEnabled !== "false" && tourEnabled !== "0",
      version: parseTourVersion(read(REMOTE_KEYS.tourVersion)),
      steps: parseTours(read(REMOTE_KEYS.tourSteps)),
    },
  });
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
    rc.defaultConfig = DEFAULTS;
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
