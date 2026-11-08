import type { AIAnalysis } from "../types";

const TEXT_KEYS = ["message", "title", "text", "description", "action", "recommendation", "summary"];

function stringValues(entry: Record<string, unknown>): string[] {
  return Object.values(entry).filter((v): v is string => typeof v === "string");
}

/** Texte lisible d'une alerte / recommandation renvoyée par le modèle (clés non garanties). */
function entryText(entry: Record<string, unknown>): string | null {
  for (const key of TEXT_KEYS) {
    const v = entry[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return stringValues(entry).find((v) => v.trim().length > 0)?.trim() ?? null;
}

/** Points de l'analyse qui mentionnent `focus` (insensible à la casse), sinon aucun. */
export function pickRelevantPoints(
  analysis: AIAnalysis,
  focus?: string,
  max = 3,
): string[] {
  const entries = [...analysis.alerts, ...analysis.recommendations];
  const needle = focus?.trim().toLowerCase();
  const relevant = needle
    ? entries.filter((e) => stringValues(e).some((v) => v.toLowerCase().includes(needle)))
    : entries;
  return relevant
    .map(entryText)
    .filter((t): t is string => !!t)
    .slice(0, max);
}
