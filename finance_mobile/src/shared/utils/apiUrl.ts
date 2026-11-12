export interface ApiUrls {
  /** Base des routes métier, toujours terminée par /api/v1. */
  api: string;
  /** Origine du serveur (healthcheck, hors /api/v1). */
  origin: string;
}

/**
 * Normalise une adresse de serveur saisie à distance (Remote Config) ou au build.
 * Accepte l'origine (« https://api.lucia.app ») ou la base complète (« …/api/v1 »).
 * Refuse tout ce qui n'est pas une URL http(s) avec un hôte : on garde alors l'adresse actuelle.
 */
export function parseApiUrl(raw: string | null | undefined): ApiUrls | null {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  const match = /^(https?:\/\/[^\s/?#]+)(\/[^\s?#]*)?$/i.exec(value);
  if (!match) return null;
  const host = match[1].replace(/^https?:\/\//i, "").split(":")[0];
  if (!host || host.startsWith(".")) return null;
  const path = (match[2] ?? "").replace(/\/api\/v1$/i, "");
  const origin = `${match[1]}${path}`;
  return { api: `${origin}/api/v1`, origin };
}
