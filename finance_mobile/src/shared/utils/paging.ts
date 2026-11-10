/** Ajoute une page à la liste déjà chargée, sans doublon (garde la première occurrence). */
export function appendUnique<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((item) => item.id));
  const fresh = incoming.filter((item) => !seen.has(item.id));
  return fresh.length === 0 ? existing : existing.concat(fresh);
}

export interface DayGroup<T> {
  /** Date ISO (AAAA-MM-JJ) commune aux éléments du groupe. */
  date: string;
  items: T[];
}

/**
 * Regroupe des éléments déjà triés par date en jours consécutifs.
 * L'ordre reçu du serveur est conservé : aucun tri n'est refait ici.
 */
export function groupByDate<T extends { date: string }>(rows: T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.date) last.items.push(row);
    else groups.push({ date: row.date, items: [row] });
  }
  return groups;
}
