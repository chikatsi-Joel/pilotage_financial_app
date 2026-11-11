/** Score d'opportunité à partir duquel une catégorie non essentielle est dite « optimisable ». */
export const OPTIMISABLE_THRESHOLD = 0.35;

export interface OptimizationInput {
  essential: boolean;
  /** Score d'opportunité calculé par le backend, entre 0 et 1. */
  opportunity_score: number;
}

export type ExpenseTagKind = "essential" | "optimisable" | "other";

export interface ExpenseTag {
  kind: ExpenseTagKind;
  label: string;
}

/** Coefficient d'optimisation affiché, « 0,72 ». */
export function optimizationCoefficient(score: number): string {
  const clamped = Math.min(Math.max(Number.isFinite(score) ? score : 0, 0), 1);
  return clamped.toFixed(2).replace(".", ",");
}

/**
 * Étiquette d'une dépense d'après sa catégorie.
 * - Essentielle : type de catégorie « essentielle » (logement, santé…).
 * - Optimisable : non essentielle ET score d'opportunité ≥ 0,35. Le coefficient est affiché.
 * - Non essentielle : le reste (aucune marge de réduction notable ce mois-ci).
 */
export function expenseTag(cat: OptimizationInput | null | undefined): ExpenseTag {
  if (!cat) return { kind: "other", label: "Non classée" };
  if (cat.essential) return { kind: "essential", label: "Essentielle" };
  if (cat.opportunity_score >= OPTIMISABLE_THRESHOLD) {
    return {
      kind: "optimisable",
      label: `Optimisable · ${optimizationCoefficient(cat.opportunity_score)}`,
    };
  }
  return { kind: "other", label: "Non essentielle" };
}
