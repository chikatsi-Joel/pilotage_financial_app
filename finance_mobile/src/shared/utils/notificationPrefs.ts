/** Écrans vers lesquels une notification peut ouvrir l'application. */
const ALLOWED_ROUTES = [
  "/dashboard",
  "/budget",
  "/savings",
  "/add-expense",
  "/analyse-insights",
] as const;

export type NotificationRoute = (typeof ALLOWED_ROUTES)[number];

/** Renvoie la route si elle fait partie de la liste autorisée, sinon null. */
export function safeRoute(value: unknown): NotificationRoute | null {
  return typeof value === "string" && (ALLOWED_ROUTES as readonly string[]).includes(value)
    ? (value as NotificationRoute)
    : null;
}

/** 7 -> "07:00". */
export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** Avance ou recule l'heure en restant dans 0-23 (23 + 1 -> 0). */
export function stepHour(hour: number, delta: number): number {
  return (((hour + delta) % 24) + 24) % 24;
}

/** Fuseau horaire de l'appareil (ex. "Africa/Douala"), "UTC" par défaut. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
