export interface DailyAllowance {
  /** Montant disponible par jour d'ici la fin du mois (0 si le solde est négatif). */
  perDay: number;
  /** Jours restants, aujourd'hui compris. */
  daysLeft: number;
}

/**
 * « Vous pouvez dépenser X par jour » : solde restant réparti sur les jours restants du mois
 * affiché. Null si ce n'est pas le mois en cours (mois passé ou futur).
 */
export function dailyAllowance(remaining: number, period: string, today: Date): DailyAllowance | null {
  const [year, month] = period.split("-").map(Number);
  if (today.getFullYear() !== year || today.getMonth() + 1 !== month) return null;
  const lastDay = new Date(year, month, 0).getDate();
  const daysLeft = lastDay - today.getDate() + 1;
  return { perDay: Math.max(remaining, 0) / daysLeft, daysLeft };
}
