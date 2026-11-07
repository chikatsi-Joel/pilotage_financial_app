export const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
] as const;

/** Date locale -> "YYYY-MM-DD" (sans passer par UTC). */
export function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "YYYY-MM-DD" -> Date locale à minuit. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** "2026-03-09" -> "9 mars 2026". */
export function formatDisplayDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseISODate(iso));
}

/** "2026-03" (ou "2026-03-09") -> "Mars 2026". */
export function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const month = MONTHS_FR[(m ?? 1) - 1] ?? "";
  return `${month} ${y ?? ""}`.trim();
}
