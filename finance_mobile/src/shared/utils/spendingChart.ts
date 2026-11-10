export interface DailyPoint {
  date: string;
  total: number;
}

export interface SpendingSeries {
  /** Nombre de jours du mois affiché. */
  lastDay: number;
  /** Dernier jour pour lequel le réel est connu (0 = mois à venir, lastDay = mois passé). */
  todayDay: number;
  /** Points [jour, cumul] du réel, de 0 jusqu'à `todayDay`. */
  real: Array<[number, number]>;
  /** Cumul réel à `todayDay`. */
  cumulative: number;
  /** Total estimé en fin de mois ; null si le mois est terminé ou pas commencé. */
  projectedEnd: number | null;
}

interface Input {
  /** Mois affiché, « AAAA-MM ». */
  period: string;
  daily: DailyPoint[];
  /** Montant habituel du mois (0 si inconnu). */
  baseline: number;
  today: Date;
}

/**
 * Série du graphique « Évolution & Projection » d'un mois.
 *
 * - Le jour est lu dans la chaîne « AAAA-MM-JJ » (pas de `new Date`, qui décale d'un jour
 *   selon le fuseau).
 * - Mois passé : tout le réel, aucune projection. Mois futur : rien.
 * - Mois en cours : la fin de mois mêle le rythme actuel (cumul / jours écoulés) et le
 *   montant habituel, le rythme pesant de plus en plus au fil du mois. La projection ne
 *   descend jamais sous le cumul déjà dépensé.
 */
export function buildSpendingSeries({ period, daily, baseline, today }: Input): SpendingSeries {
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();

  const gap = year * 12 + (month - 1) - (today.getFullYear() * 12 + today.getMonth());
  const todayDay = gap > 0 ? 0 : gap < 0 ? lastDay : Math.min(today.getDate(), lastDay);

  const perDay = new Map<number, number>();
  for (const point of daily) {
    if (!point.date || point.date.slice(0, 7) !== period) continue;
    const day = Number(point.date.slice(8, 10));
    if (day >= 1 && day <= lastDay) perDay.set(day, (perDay.get(day) ?? 0) + point.total);
  }

  const real: Array<[number, number]> = [[0, 0]];
  let cumulative = 0;
  for (let day = 1; day <= todayDay; day++) {
    cumulative += perDay.get(day) ?? 0;
    real.push([day, cumulative]);
  }

  let projectedEnd: number | null = null;
  if (todayDay >= 1 && todayDay < lastDay) {
    const remainingDays = lastDay - todayDay;
    const paceRemaining = (cumulative / todayDay) * remainingDays;
    const habitualRemaining = baseline > 0 ? Math.max(baseline - cumulative, 0) : paceRemaining;
    const weight = todayDay / lastDay;
    projectedEnd = cumulative + weight * paceRemaining + (1 - weight) * habitualRemaining;
  }

  return { lastDay, todayDay, real, cumulative, projectedEnd };
}
