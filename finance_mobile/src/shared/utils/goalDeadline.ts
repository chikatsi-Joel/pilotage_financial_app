/** Échéances proposées d'office, en mois. */
export const DEADLINE_PRESETS = [6, 12, 24, 36] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** Aujourd'hui + n mois, en "YYYY-MM-DD" local (le 31 janvier + 1 mois donne le 28/29 février). */
export function addMonthsISO(from: Date, months: number): string {
  const target = new Date(from.getFullYear(), from.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(from.getDate(), lastDay);
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(day)}`;
}

/**
 * Mois (fractionnaires) entre aujourd'hui et l'échéance, comptés en mois du calendrier
 * (31 janv. → 31 janv. suivant = 12 exactement) ; négatif si l'échéance est passée.
 */
export function monthsUntil(deadlineISO: string, today: Date): number {
  const [y, m, d] = deadlineISO.slice(0, 10).split("-").map(Number);
  const daysIn = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate();
  const whole = (y - today.getFullYear()) * 12 + ((m ?? 1) - 1 - today.getMonth());
  return whole + ((d ?? 1) - today.getDate()) / daysIn(today.getFullYear(), today.getMonth());
}

/** Preset (en mois) qui correspond à cette échéance, à 3 jours près ; null sinon. */
export function matchingPreset(deadlineISO: string, today: Date): number | null {
  for (const months of DEADLINE_PRESETS) {
    const preset = addMonthsISO(today, months);
    if (Math.abs(daysUntil(deadlineISO, today) - daysUntil(preset, today)) <= 3) return months;
  }
  return null;
}

/** Jours calendaires entre aujourd'hui et l'échéance. */
function daysUntil(deadlineISO: string, today: Date): number {
  const [y, m, d] = deadlineISO.slice(0, 10).split("-").map(Number);
  const due = new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((due - start) / 86_400_000);
}

/**
 * Versement mensuel nécessaire pour atteindre la cible à l'échéance.
 * 0 si déjà atteint ; null si l'échéance est passée ou à moins d'un jour.
 */
export function monthlyNeeded(target: number, current: number, deadlineISO: string, today: Date): number | null {
  const remaining = target - current;
  if (remaining <= 0) return 0;
  const months = monthsUntil(deadlineISO, today);
  if (daysUntil(deadlineISO, today) < 1) return null;
  return remaining / Math.max(months, 1);
}

/** "Dans 1 an et 3 mois" / "Dans 8 mois" / "Échéance dépassée". */
export function durationLabel(deadlineISO: string, today: Date): string {
  const months = Math.round(monthsUntil(deadlineISO, today));
  if (daysUntil(deadlineISO, today) < 1) return "Échéance dépassée";
  if (months < 1) return "Dans moins d'un mois";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years ? `${years} an${years > 1 ? "s" : ""}` : "";
  const m = rest ? `${rest} mois` : "";
  return `Dans ${[y, m].filter(Boolean).join(" et ")}`;
}
