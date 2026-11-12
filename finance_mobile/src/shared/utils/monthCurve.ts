export interface DayTotal {
  date: string;
  total: number;
}

export interface MonthCurve {
  /** Nombre de jours du mois. */
  days: number;
  /** Dépensé cumulé à la fin de chaque jour écoulé : index 0 = jour 1. Vide pour un mois à venir. */
  cumulative: number[];
}

/**
 * Cumul des dépenses jour par jour sur le mois `period` (« AAAA-MM »),
 * arrêté à aujourd'hui pour le mois en cours, complet pour un mois passé.
 */
export function buildMonthCurve(daily: DayTotal[], period: string, today: Date): MonthCurve {
  const [y, m] = period.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const current = today.getFullYear() === y && today.getMonth() + 1 === m;
  const ahead = y * 12 + m > today.getFullYear() * 12 + today.getMonth() + 1;
  const end = ahead ? 0 : current ? today.getDate() : days;

  const perDay = new Array<number>(days).fill(0);
  for (const d of daily) {
    const [dy, dm, dd] = d.date.slice(0, 10).split("-").map(Number);
    if (dy === y && dm === m && dd >= 1 && dd <= days) perDay[dd - 1] += d.total;
  }

  const cumulative: number[] = [];
  let sum = 0;
  for (let i = 0; i < end; i++) {
    sum += perDay[i];
    cumulative.push(sum);
  }
  return { days, cumulative };
}
