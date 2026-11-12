export interface ScenarioLine {
  /** Dépense mensuelle de référence de la catégorie. */
  reference: number;
  /** Réduction choisie, en % (0..100). */
  percent: number;
}

export interface ScenarioTotals {
  monthly: number;
  annual: number;
  /** Taux d'épargne du mois si l'économie avait été faite ; null sans revenus. */
  rate: number | null;
  /** Nombre de catégories avec un effort. */
  efforts: number;
}

/** Économie d'une ligne : référence × réduction. */
export function lineSaving(line: ScenarioLine): number {
  return (line.reference * line.percent) / 100;
}

/**
 * Totaux d'un scénario multi-catégories. Le taux suit la même formule que le serveur
 * (what_if.simulate_what_if) : (revenus − (dépenses − économie)) / revenus.
 */
export function scenarioTotals(lines: ScenarioLine[], income: number, expenses: number): ScenarioTotals {
  const monthly = lines.reduce((s, l) => s + lineSaving(l), 0);
  const rate = income > 0 ? (income - Math.max(0, expenses - monthly)) / income : null;
  return {
    monthly,
    annual: monthly * 12,
    rate,
    efforts: lines.filter((l) => l.percent > 0 && l.reference > 0).length,
  };
}

export type GoalImpact =
  | { kind: "reached" }
  /** Atteint plus tôt qu'au rythme actuel. */
  | { kind: "sooner"; months: number; gained: number }
  /** Aucun versement récent : l'économie seule permettrait d'y arriver en `months` mois. */
  | { kind: "possible"; months: number }
  | { kind: "none" };

/**
 * Effet de l'économie mensuelle `extra` sur un objectif, si elle y est versée en plus
 * du rythme actuel. Les mois sont arrondis au supérieur.
 */
export function goalImpact(g: { current: number; target: number; monthlyPace: number; extra: number }): GoalImpact {
  const remaining = g.target - g.current;
  if (remaining <= 0) return { kind: "reached" };
  if (g.extra <= 0) return { kind: "none" };
  const withExtra = Math.ceil(remaining / (g.monthlyPace + g.extra));
  if (g.monthlyPace <= 0) return { kind: "possible", months: withExtra };
  const now = Math.ceil(remaining / g.monthlyPace);
  return now > withExtra ? { kind: "sooner", months: withExtra, gained: now - withExtra } : { kind: "none" };
}
