/** Sous ce seuil (pente mensuelle relative), la tendance est jugée stable. */
export const STABLE_BAND = 0.03;

/** Historique minimal pour comparer deux mois (résultat indicatif). */
export const MIN_INDICATIVE_MONTHS = 2;

/** Historique à partir duquel la pente statistique est fiable. */
export const MIN_RELIABLE_MONTHS = 3;

export interface TrendInput {
  trend: number;
  drift_score: number;
  history_months?: number | null;
  /** Variation relative entre les deux derniers mois (0.25 = +25 %). */
  last_change?: number | null;
}

export interface TrendView {
  label: string;
  sub: string;
}

function direction(value: number): string {
  if (value > STABLE_BAND) return "↗ En hausse";
  if (value < -STABLE_BAND) return "↘ En baisse";
  return "→ Stable";
}

const signed = (pct: number): string => `${pct > 0 ? "+" : ""}${pct}`;

/**
 * Libellé de tendance d'une catégorie.
 * - 1 mois : trop tôt ; 2 mois : sens indicatif d'après le mois précédent ;
 * - 3 mois et plus : pente statistique.
 */
export function describeTrend(profile: TrendInput | null): TrendView {
  if (!profile) return { label: "—", sub: "" };

  const months = profile.history_months;
  if (months != null && months < MIN_INDICATIVE_MONTHS) {
    return { label: "Trop tôt", sub: "1 seul mois de données" };
  }

  if (months != null && months < MIN_RELIABLE_MONTHS) {
    const change = profile.last_change;
    if (change == null) return { label: "Trop tôt", sub: `${months} mois de données` };
    return {
      label: direction(change),
      sub: `Indicatif · ${signed(Math.round(change * 100))} % vs mois précédent`,
    };
  }

  const sub =
    profile.drift_score > 0.6
      ? "Hausse durable"
      : `${signed(Math.round(profile.trend * 100))} % par mois`;
  return { label: direction(profile.trend), sub };
}

/**
 * Explication d'une catégorie par rapport à son habitude. Objectif : dépenser moins. Une baisse
 * est valorisée ; « réduire » n'est proposé que pour une hausse avec une économie possible.
 * `money` formate un montant (injecté : module sans dépendance).
 */
export function categoryRationale(
  name: string,
  variationPct: number,
  potentialSaving: number,
  money: (value: number) => string,
): string {
  const pct = Math.round(Math.abs(variationPct));
  if (variationPct < -0.5) {
    return `Vos dépenses « ${name} » sont ${pct} % sous votre habitude : bel effort, continuez ainsi.`;
  }
  if (variationPct <= 0.5 || potentialSaving <= 0) {
    return variationPct <= 0.5
      ? `Vos dépenses « ${name} » sont conformes à votre habitude.`
      : `Vos dépenses « ${name} » sont ${pct} % au-dessus de votre habitude.`;
  }
  return `Vos dépenses « ${name} » sont ${pct} % au-dessus de votre habitude. Revenir à votre niveau habituel libérerait environ ${money(
    potentialSaving,
  )} ce mois-ci.`;
}
