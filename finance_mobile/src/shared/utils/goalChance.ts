import type { ContributionPoint } from "./savingsTrajectory";

const MONTH = 30.4375 * 86_400_000;
/** Mois d'historique pris en compte pour mesurer la régularité des versements. */
const HISTORY_MONTHS = 6;
/**
 * Incertitude minimale, en part du rythme : 35 % avec un long historique, davantage quand il
 * est court (100 % avec un seul mois) — quelques versements ne prouvent pas un rythme durable.
 */
const MIN_SPREAD = 0.35;
const SHORT_HISTORY_SPREAD = 0.65;

/** Même lecture des horodatages que la trajectoire (microsecondes ramenées à 3 chiffres). */
function parseInstant(iso: string): number {
  return new Date(iso.replace(/(\.\d{3})\d+/, "$1")).getTime();
}

export type ChanceTone = "good" | "mid" | "low" | "none";

export interface GoalChance {
  /** Probabilité (0..1) d'atteindre la cible à l'échéance ; null sans versement pour l'estimer. */
  probability: number | null;
  tone: ChanceTone;
  /** « 72 % », « > 95 % », « < 5 % », ou « — ». */
  label: string;
  /** Moins de 2 mois d'historique : estimation à prendre avec prudence. */
  fragile: boolean;
}

/** Fonction de répartition de la loi normale centrée réduite (approximation d'Abramowitz-Stegun). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const tail =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - tail : tail;
}

function toneOf(p: number): ChanceTone {
  return p >= 0.7 ? "good" : p >= 0.4 ? "mid" : "low";
}

function labelOf(p: number): string {
  if (p > 0.95) return "> 95 %";
  if (p < 0.05) return "< 5 %";
  return `${Math.round(p * 100)} %`;
}

/** Totaux par mois calendaire, du mois du premier versement au mois en cours (6 derniers au plus). */
function monthlyTotals(contributions: readonly ContributionPoint[], today: number): number[] {
  const now = new Date(today);
  const index = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const current = index(now);
  const first = Math.min(...contributions.map((c) => index(new Date(parseInstant(c.created_at)))));
  const from = Math.max(first, current - HISTORY_MONTHS + 1);
  const totals = new Array<number>(current - from + 1).fill(0);
  for (const c of contributions) {
    const i = index(new Date(parseInstant(c.created_at))) - from;
    if (i >= 0 && i < totals.length) totals[i] += Number(c.amount) || 0;
  }
  return totals;
}

/**
 * Chance d'atteindre l'objectif à l'échéance.
 *
 * Les versements des prochains mois sont modélisés comme indépendants, de moyenne le rythme
 * actuel (celui de la courbe « Rythme actuel ») et d'écart-type celui des totaux mensuels
 * récents (au moins 35 % du rythme). La somme sur les n mois restants suit alors
 * approximativement une loi normale N(n·rythme, écart·√n) ; on renvoie P(somme ≥ reste).
 */
export function goalChance({
  contributions,
  monthlyPace,
  current,
  target,
  deadline,
  today,
}: {
  contributions: readonly ContributionPoint[];
  monthlyPace: number;
  current: number;
  target: number;
  deadline: number;
  today: number;
}): GoalChance {
  const remaining = target - current;
  if (remaining <= 0) return { probability: 1, tone: "good", label: "100 %", fragile: false };
  const monthsLeft = (deadline - today) / MONTH;
  if (monthsLeft <= 0) return { probability: 0, tone: "low", label: "0 %", fragile: false };
  if (contributions.length === 0) return { probability: null, tone: "none", label: "—", fragile: false };

  const totals = monthlyTotals(contributions, today);
  const mean = totals.reduce((s, v) => s + v, 0) / totals.length;
  const spread = Math.sqrt(totals.reduce((s, v) => s + (v - mean) ** 2, 0) / totals.length);
  const pace = Math.max(monthlyPace, 0);
  const floor = (MIN_SPREAD + SHORT_HISTORY_SPREAD / totals.length) * pace;
  const sigma = Math.max(spread, floor, 1) * Math.sqrt(monthsLeft);

  const p = normalCdf((pace * monthsLeft - remaining) / sigma);
  return { probability: p, tone: toneOf(p), label: labelOf(p), fragile: totals.length < 2 };
}
