/** Valeurs Remote Config d'exploitation (maintenance, annonce), déjà nettoyées. */
export interface RemoteFlags {
  maintenance: { enabled: boolean; message: string };
  announcement: { text: string; link: string | null } | null;
}

export const DEFAULT_MAINTENANCE_MESSAGE =
  "Nous améliorons Lucia. L'application revient dans quelques minutes.";

export const NO_FLAGS: RemoteFlags = {
  maintenance: { enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE },
  announcement: null,
};

/** Seuls les liens https sont ouverts depuis l'annonce. */
function safeLink(raw: string): string | null {
  const value = raw.trim();
  return /^https:\/\/[^\s]+$/i.test(value) ? value : null;
}

/**
 * Valeurs brutes de Remote Config → drapeaux. Tolérant : un champ vide ou mal saisi dans la
 * console retombe sur « pas de maintenance / pas d'annonce » plutôt que de bloquer l'app.
 */
export function parseRemoteFlags(raw: {
  maintenanceEnabled: string;
  maintenanceMessage: string;
  announcementText: string;
  announcementLink: string;
}): RemoteFlags {
  const enabled = ["true", "1", "yes", "oui"].includes(raw.maintenanceEnabled.trim().toLowerCase());
  const message = raw.maintenanceMessage.trim() || DEFAULT_MAINTENANCE_MESSAGE;
  const text = raw.announcementText.trim().slice(0, 280);
  return {
    maintenance: { enabled, message },
    announcement: text ? { text, link: safeLink(raw.announcementLink) } : null,
  };
}
