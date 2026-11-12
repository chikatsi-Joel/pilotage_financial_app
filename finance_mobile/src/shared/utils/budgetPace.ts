export interface WeekAmount {
  label: string;
  prevu: number;
  reel: number;
}

export type PaceTone = "none" | "over" | "fast" | "ok" | "slow";

export interface BudgetPace {
  budget: number;
  spent: number;
  /** Part du budget dépensée (0..∞). */
  spentShare: number;
  /** Part du mois écoulée (0..1), 1 pour un mois terminé. */
  timeShare: number;
  tone: PaceTone;
  message: string;
  /** Semaines dont la période n'a pas encore commencé (aucune dépense attendue). */
  upcoming: boolean[];
}

/**
 * Budget du mois face au temps écoulé :
 * - dépassé si le dépensé excède le budget ;
 * - « plus vite que prévu » si la part dépensée devance la part du mois écoulée de plus de 5 points ;
 * - « en avance » (bonne nouvelle) si elle est en retard de plus de 5 points.
 */
export function budgetPace(weeks: WeekAmount[], spent: number, period: string, today: Date): BudgetPace {
  const budget = weeks.reduce((s, w) => s + w.prevu, 0);
  const [y, m] = period.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const isCurrent = today.getFullYear() === y && today.getMonth() + 1 === m;
  const ahead = y * 12 + m > today.getFullYear() * 12 + today.getMonth() + 1;
  const timeShare = ahead ? 0 : isCurrent ? today.getDate() / lastDay : 1;
  const spentShare = budget > 0 ? spent / budget : 0;

  const n = Math.max(weeks.length, 1);
  const upcoming = weeks.map((w, i) => w.reel === 0 && i / n >= timeShare);

  let tone: PaceTone;
  let message: string;
  if (budget <= 0) {
    tone = "none";
    message = "Aucun budget validé pour ce mois. Validez-le dans l'onglet Budget.";
  } else if (spent > budget) {
    tone = "over";
    message = "Budget du mois dépassé.";
  } else if (spentShare > timeShare + 0.05) {
    tone = "fast";
    message = "Vous dépensez plus vite que prévu.";
  } else if (spentShare < timeShare - 0.05) {
    tone = "slow";
    message = "Vous êtes en dessous de votre rythme prévu.";
  } else {
    tone = "ok";
    message = "Vos dépenses suivent le rythme prévu.";
  }

  return { budget, spent, spentShare, timeShare, tone, message, upcoming };
}

/** « 85k », « 1,2M », « 950 » — pour les petites étiquettes. */
export function compactAmount(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")}M`;
  if (a >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(Math.round(v));
}
