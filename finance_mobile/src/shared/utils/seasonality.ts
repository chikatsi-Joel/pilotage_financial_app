export interface MonthTotal {
  /** « AAAA-MM » */
  period: string;
  total: number;
}

export interface SeasonalitySummary {
  /** Mois affichés, du plus ancien au mois courant. */
  months: MonthTotal[];
  /** Mois avec au moins une dépense dans la fenêtre. */
  historyMonths: number;
  /** Moyenne des mois passés avec dépenses (mois courant exclu). */
  average: number | null;
  /** Dépenses du mois courant, extrapolées à la fin du mois s'il n'est pas terminé. */
  projectedCurrent: number;
  /** Le mois courant est en cours (montant projeté, pas définitif). */
  partial: boolean;
  /** Écart du mois courant (projeté) à la moyenne, 0.25 = +25 %. */
  vsAverage: number | null;
  /** Même mois l'an dernier, s'il a des dépenses. */
  lastYear: MonthTotal | null;
  /** Écart au même mois l'an dernier. */
  vsLastYear: number | null;
  /** Mois passé le plus dépensier. */
  peak: MonthTotal | null;
  /** Assez d'historique pour en tirer une tendance. */
  enough: boolean;
}

export const MIN_SEASON_MONTHS = 3;

function shift(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * Résumé saisonnier à partir des totaux mensuels du serveur.
 * Le mois courant n'étant pas fini, il est extrapolé (dépensé ÷ jours écoulés × jours du mois)
 * avant d'être comparé à la moyenne et au même mois de l'année précédente.
 */
export function summarizeSeason(months: MonthTotal[], period: string, today: Date): SeasonalitySummary {
  const ordered = [...months].sort((a, b) => a.period.localeCompare(b.period));
  const current = ordered.find((m) => m.period === period)?.total ?? 0;
  const past = ordered.filter((m) => m.period < period && m.total > 0);

  const [y, m] = period.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m;
  const elapsed = isCurrentMonth ? Math.min(today.getDate(), daysInMonth) : daysInMonth;
  const partial = isCurrentMonth && elapsed < daysInMonth;
  const projectedCurrent = partial && elapsed > 0 ? (current / elapsed) * daysInMonth : current;

  const average = past.length ? past.reduce((s, x) => s + x.total, 0) / past.length : null;
  const lastYearPeriod = shift(period, -12);
  const lastYear = ordered.find((x) => x.period === lastYearPeriod && x.total > 0) ?? null;
  const peak = past.reduce<MonthTotal | null>((best, x) => (!best || x.total > best.total ? x : best), null);
  const historyMonths = ordered.filter((x) => x.total > 0).length;

  return {
    months: ordered,
    historyMonths,
    average,
    projectedCurrent,
    partial,
    vsAverage: average ? projectedCurrent / average - 1 : null,
    lastYear,
    vsLastYear: lastYear ? projectedCurrent / lastYear.total - 1 : null,
    peak,
    enough: past.length >= MIN_SEASON_MONTHS - 1 && historyMonths >= MIN_SEASON_MONTHS,
  };
}
