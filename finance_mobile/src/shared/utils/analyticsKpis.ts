/**
 * Indicateurs analytiques de l'écran Analyses : KPI globaux et lecture détaillée de chaque
 * catégorie (tendance, volatilité, confiance, prévision, saisonnalité, anomalie, dérive…),
 * traduits en phrases. Fonctions pures, sans dépendance : testées dans tests/utils.test.cjs.
 *
 * Rappel des définitions du moteur (backend app/services/analytics) :
 * - trend : pente de Theil-Sen divisée par la médiane → variation relative par mois ;
 * - volatility : MAD / médiane des mois passés (dispersion relative robuste) ;
 * - confidence : min(mois/12, 1) / (1 + dispersion), dans [0, 1] ;
 * - anomaly_score : z robuste modifié de la dernière valeur, hausses seulement (seuil 3,5) ;
 * - drift_score : hausse de la médiane entre les deux moitiés de l'historique, dans [0, 1] ;
 * - forecast : espérance calendaire (usage × montant), méthode choisie et évaluée hors
 *   échantillon ; low/high : fourchette conforme à 80 % ; projection : mois en cours au rythme
 *   habituel (dépensé + reste attendu).
 */
import type { CategoryAnalytics, MonthlyTotal } from "../types";

// ── Libellés ────────────────────────────────────────────────────────────────

export type Level = "low" | "medium" | "high";

/** Seuils de confiance identiques au backend (analytics_service._confidence_level). */
export function confidenceLevel(confidence: number): Level {
  return confidence >= 0.75 ? "high" : confidence >= 0.25 ? "medium" : "low";
}

export const CONFIDENCE_LABEL: Record<Level, string> = { high: "élevée", medium: "moyenne", low: "faible" };

export type Stability = "stable" | "variable" | "unpredictable";

export function stabilityOf(volatility: number): Stability {
  if (volatility < 0.15) return "stable";
  return volatility < 0.4 ? "variable" : "unpredictable";
}

/** Écart typique relatif ≈ un écart-type : 1,48 × MAD relative. */
export const SWING_FACTOR = 1.48;

export const STABILITY_LABEL: Record<Stability, string> = {
  stable: "Régulière",
  variable: "Variable",
  unpredictable: "Irrégulière",
};

// ── Tons de la matrice (vert / ambre / rouge / neutre) ───────────────────────
//
// Objectif de l'app : dépenser moins pour épargner plus. Seul le SENS de la dépense est jugé :
// une baisse est toujours bonne, une hausse à surveiller ou problématique. La régularité et la
// fiabilité décrivent les données (dépenser rarement rend une catégorie « irrégulière » et peu
// fiable), elles restent neutres.

export type Tone = "good" | "warn" | "bad" | "info";

/** Baisse ou stabilité : bien ; hausse au-delà de 2 % par mois : à surveiller ; 15 % : problème. */
export function trendTone(trend: number): Tone {
  return trend <= 0.02 ? "good" : trend < 0.15 ? "warn" : "bad";
}

/**
 * Anomalie à la hausse du dernier mois (le moteur ne compte plus les mois anormalement bas) :
 * sous 2 normal, 2 à 3,5 inhabituel, au-delà hors norme.
 */
export function anomalyTone(score: number): Tone {
  return score < 2 ? "good" : score < 3.5 ? "warn" : "bad";
}

/** Dérive (à la hausse) du niveau habituel. */
export function driftTone(drift: number): Tone {
  return drift < 0.2 ? "good" : drift < 0.5 ? "warn" : "bad";
}

/** Tendance publiée à partir de 6 mois d'historique (en dessous, le moteur la met à 0). */
export const MIN_TREND_MONTHS = 6;

/**
 * Montant attendu sur le mois pour une catégorie. Mois en cours : projection du moteur (déjà
 * dépensé + reste au rythme habituel), à défaut jamais moins que le déjà dépensé.
 */
export function expectedForMonth(
  forecast: { value: number; projection?: number | null },
  current: number,
  running: boolean,
): number {
  if (!running) return forecast.value;
  return forecast.projection ?? Math.max(forecast.value, current);
}

// ── Lecture par catégorie ───────────────────────────────────────────────────

export interface CategoryInsight {
  id: string;
  name: string;
  essential: boolean;
  habit: number;
  current: number;
  expected: number;
  /** null : inconnu (ancienne réponse du serveur), à ne pas confondre avec 0. */
  historyMonths: number | null;
  trend: number;
  volatility: number;
  stability: Stability;
  /** Écart typique en montant (≈ un écart-type : 1,48 × MAD). */
  typicalSwing: number;
  confidence: number;
  forecast: CategoryAnalytics["profile"]["forecast"];
  seasonality: { strength: number; reliable: boolean };
  anomaly: number;
  drift: number;
  changePoints: number;
  lastChange: number | null;
  potentialSaving: number;
  opportunity: number;
}

/** Catégories avec historique, de la plus grosse habitude à la plus petite. */
export function categoryInsights(items: CategoryAnalytics[]): CategoryInsight[] {
  return items
    .filter((c) => c.baseline_amount > 0)
    .sort((a, b) => b.baseline_amount - a.baseline_amount)
    .map((c) => {
      const p = c.profile;
      return {
        id: c.category_id,
        name: c.name,
        essential: c.essential,
        habit: c.baseline_amount,
        current: c.current_amount,
        expected: c.expected_amount,
        historyMonths: p.history_months ?? null,
        trend: p.trend,
        volatility: p.volatility,
        stability: stabilityOf(p.volatility),
        typicalSwing: SWING_FACTOR * p.volatility * c.baseline_amount,
        confidence: p.confidence,
        forecast: p.forecast,
        seasonality: { strength: p.seasonality_strength, reliable: p.seasonality_reliable },
        anomaly: p.anomaly_score,
        drift: p.drift_score,
        changePoints: p.change_points.length,
        lastChange: p.last_change ?? null,
        potentialSaving: c.potential_saving,
        opportunity: c.opportunity_score,
      };
    });
}

// ── KPI globaux ─────────────────────────────────────────────────────────────

export interface Kpis {
  /** Tendance moyenne pondérée par l'habitude (variation relative / mois). */
  trend: number | null;
  /** Volatilité moyenne pondérée par l'habitude. */
  volatility: number | null;
  /** Confiance moyenne pondérée par l'habitude. */
  confidence: number | null;
  /**
   * Prévision du total du mois. Mois en cours : déjà dépensé (toutes catégories, base de
   * /monthly) + Σ reste attendu par catégorie (projection − dépensé) ; mois terminé : Σ des
   * espérances. Fourchette indicative (sans probabilité affichée) : écarts par catégorie
   * combinés en √Σ², exact si les catégories sont indépendantes, trop étroit si elles varient
   * ensemble (mois de fêtes) ; null si une catégorie qui compte n'a pas de fourchette.
   */
  forecast: { total: number; low: number | null; high: number | null } | null;
  /** Coefficient de variation des totaux mensuels complets (écart-type / moyenne). */
  monthlyCv: number | null;
  /** Épargne / revenus cumulés sur les mois complets. */
  savingsRate: number | null;
  /** Part des dépenses essentielles dans les habitudes. */
  essentialShare: number | null;
  /** Nombre minimal de catégories qui font 80 % des habitudes. */
  concentration: { count: number; of: number } | null;
  drifting: number;
  irregular: number;
  potentialSaving: number;
  historyMonths: number;
  fullMonths: number;
}

function weighted(items: CategoryAnalytics[], pick: (c: CategoryAnalytics) => number): number | null {
  const total = items.reduce((s, c) => s + c.baseline_amount, 0);
  if (total <= 0) return null;
  return items.reduce((s, c) => s + pick(c) * c.baseline_amount, 0) / total;
}

/**
 * `months` : totaux mensuels (/analytics/monthly) ; `partial` : mois en cours à exclure des
 * statistiques mensuelles (incomplet).
 */
export function computeKpis(items: CategoryAnalytics[], months: MonthlyTotal[], partial: string | null): Kpis {
  const pool = items.filter((c) => c.baseline_amount > 0);

  const forecast = monthForecast(items, months, partial);

  // Mois complets avec dépenses : un mois sans saisie (début d'usage) gonflerait l'épargne.
  const full = months.filter((m) => m.period !== partial && m.total > 0);
  const totals = full.map((m) => m.total);
  const mean = totals.length ? totals.reduce((s, v) => s + v, 0) / totals.length : 0;
  const monthlyCv =
    totals.length >= 2 && mean > 0
      ? Math.sqrt(totals.reduce((s, v) => s + (v - mean) ** 2, 0) / (totals.length - 1)) / mean
      : null;
  const income = full.reduce((s, m) => s + m.income, 0);
  const savingsRate = income > 0 ? full.reduce((s, m) => s + m.savings, 0) / income : null;

  const habitTotal = pool.reduce((s, c) => s + c.baseline_amount, 0);
  const essentialShare =
    habitTotal > 0 ? pool.filter((c) => c.essential).reduce((s, c) => s + c.baseline_amount, 0) / habitTotal : null;

  let concentration: Kpis["concentration"] = null;
  if (habitTotal > 0) {
    const sorted = pool.map((c) => c.baseline_amount).sort((a, b) => b - a);
    let acc = 0;
    let count = 0;
    for (const v of sorted) {
      acc += v;
      count += 1;
      if (acc >= 0.8 * habitTotal) break;
    }
    concentration = { count, of: sorted.length };
  }

  // Tendance : seulement les catégories assez anciennes (les autres valent 0 par construction).
  const trendPool = pool.filter((c) => (c.profile.history_months ?? 0) >= MIN_TREND_MONTHS);

  return {
    trend: weighted(trendPool, (c) => c.profile.trend),
    volatility: weighted(pool, (c) => c.profile.volatility),
    confidence: weighted(pool, (c) => c.profile.confidence),
    forecast,
    monthlyCv,
    savingsRate,
    essentialShare,
    concentration,
    drifting: pool.filter((c) => c.profile.drift_score >= 0.5).length,
    irregular: pool.filter((c) => stabilityOf(c.profile.volatility) === "unpredictable").length,
    potentialSaving: items.reduce((s, c) => s + c.potential_saving, 0),
    historyMonths: pool.reduce((m, c) => Math.max(m, c.profile.history_months ?? 0), 0),
    fullMonths: full.length,
  };
}

/** Prévision du total du mois et sa fourchette (voir Kpis.forecast). */
export function monthForecast(
  items: CategoryAnalytics[],
  months: MonthlyTotal[],
  partial: string | null,
): Kpis["forecast"] {
  const running = partial != null;
  type Part = { mid: number; low: number | null; high: number | null };
  const parts: Part[] = items
    .map((c): Part | null => {
      const f = c.profile.forecast;
      if (running) {
        // Reste attendu de la catégorie (0 si sa projection est déjà atteinte).
        const proj = f.projection ?? Math.max(f.value, c.current_amount);
        const low = f.projection_low ?? null;
        const high = f.projection_high ?? null;
        return {
          mid: proj - c.current_amount,
          low: low == null ? null : low - c.current_amount,
          high: high == null ? null : high - c.current_amount,
        };
      }
      return f.value > 0 ? { mid: f.value, low: f.low ?? null, high: f.high ?? null } : null;
    })
    .filter((p): p is Part => p != null && p.mid > 0);

  if (!running && parts.length === 0) return null;
  const base = running
    ? (months.find((m) => m.period === partial)?.total ?? items.reduce((s, c) => s + c.current_amount, 0))
    : 0;
  const total = base + parts.reduce((s, p) => s + p.mid, 0);
  if (running && total <= 0) return null;

  const complete = parts.every((p) => p.low != null && p.high != null);
  if (!complete || parts.length === 0) return { total, low: null, high: null };
  const down = Math.sqrt(parts.reduce((s, p) => s + (p.mid - (p.low as number)) ** 2, 0));
  const up = Math.sqrt(parts.reduce((s, p) => s + ((p.high as number) - p.mid) ** 2, 0));
  return { total, low: Math.max(base, total - down), high: total + up };
}
