/** Sous ce seuil (pente mensuelle relative), la tendance est jugée stable. */
export const STABLE_BAND = 0.03;

/** En dessous, l'historique est trop court pour qualifier une tendance. */
export const MIN_HISTORY_MONTHS = 3;

export interface TrendInput {
  trend: number;
  drift_score: number;
  history_months?: number | null;
}

export interface TrendView {
  label: string;
  sub: string;
}

/** Libellé de tendance d'une catégorie : hausse, baisse, stable, ou historique insuffisant. */
export function describeTrend(profile: TrendInput | null): TrendView {
  if (!profile) return { label: "—", sub: "" };

  const months = profile.history_months;
  if (months != null && months < MIN_HISTORY_MONTHS) {
    return {
      label: "Trop tôt",
      sub: `${months} mois de données (3 requis)`,
    };
  }

  const pct = Math.round(profile.trend * 100);
  const label =
    profile.trend > STABLE_BAND
      ? "↗ En hausse"
      : profile.trend < -STABLE_BAND
        ? "↘ En baisse"
        : "→ Stable";
  const sub =
    profile.drift_score > 0.6
      ? "Dérive marquée"
      : `${pct > 0 ? "+" : ""}${pct} % par mois`;
  return { label, sub };
}
