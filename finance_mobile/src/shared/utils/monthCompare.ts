/** « AAAA-MM » décalé de `months` mois. */
export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * Bornes du mois précédent à comparer avec `period`.
 * Mois en cours : du 1er au même jour du mois précédent (comparaison à date égale).
 * Mois terminé : le mois précédent entier.
 */
export function previousRange(period: string, today: Date): { period: string; from: string; to: string; sameDate: boolean } {
  const prev = shiftPeriod(period, -1);
  const [py, pm] = prev.split("-").map(Number);
  const prevLast = new Date(py, pm, 0).getDate();
  const [y, m] = period.split("-").map(Number);
  const isCurrent = today.getFullYear() === y && today.getMonth() + 1 === m;
  const day = isCurrent ? Math.min(today.getDate(), prevLast) : prevLast;
  return {
    period: prev,
    from: `${prev}-01`,
    to: `${prev}-${String(day).padStart(2, "0")}`,
    sameDate: isCurrent,
  };
}

/** Variation relative (0.12 = +12 %), null si la base est nulle. */
export function relativeChange(current: number, previous: number | null | undefined): number | null {
  if (previous == null || previous <= 0) return null;
  return current / previous - 1;
}
