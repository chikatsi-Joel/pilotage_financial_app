/**
 * Freemium de l'analyse IA (compte gratuit) : textes communs aux écrans qui affichent une
 * analyse. Le serveur ne consomme le quota que sur demande explicite (première analyse du mois
 * ou « Mettre à jour ») ; sinon il resservit la dernière analyse, marquée `stale`.
 */
import type { AIAnalysis, AIQuota } from "../types";

/** « 1er décembre » : jour où le quota gratuit revient (`resets_at`, minuit UTC). */
export function resetLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "le mois prochain";
  return `le 1er ${d.toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" })}`;
}

/** « 12 novembre » : date d'une analyse resservie. */
export function analysisDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

/** « 2 analyses gratuites » (accord en nombre, 0 et 1 au singulier). */
export function freeAnalyses(n: number): string {
  return n > 1 ? `${n} analyses gratuites` : `${n} analyse gratuite`;
}

/** Ligne d'état à afficher sous une analyse, ou null si elle est à jour. */
export function analysisStatusNote(a: Pick<AIAnalysis, "pending" | "quota_exceeded" | "stale" | "analyzed_at" | "quota">): string | null {
  if (a.pending) return "Analyse en cours de préparation… revenez dans un instant.";
  if (a.quota_exceeded && a.quota) {
    return `Analyses gratuites du mois utilisées · de nouveau disponibles ${resetLabel(a.quota.resets_at)}.`;
  }
  if (a.stale) {
    const day = analysisDate(a.analyzed_at);
    return `${day ? `Analyse du ${day}` : "Analyse précédente"} · vos données ont changé depuis.`;
  }
  return null;
}

/** Une mise à jour (consommant une analyse gratuite) est-elle possible ? */
export function canUpdate(quota: AIQuota | null | undefined): boolean {
  return quota?.remaining == null || quota.remaining > 0;
}
