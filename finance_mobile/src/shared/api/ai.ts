import api, { buildPath } from "./client";
import type {
  AIAnalysis,
  AIAnalysisStored,
  AIHealth,
  CategoryExplanation,
  PaginatedResponse,
} from "../types";

function path(userId: string) {
  return buildPath("/users/{user_id}/ai", { user_id: userId });
}

export const ai = {
  /** Analyse du mois : resservie par le serveur tant que les données n'ont pas changé ;
   *  `force` relance le modèle. */
  analyze: (userId: string, period: string, force = false) =>
    api
      .post<AIAnalysis>(`${path(userId)}/analyze`, null, {
        params: force ? { period, force } : { period },
        // Le modèle cloud peut mettre jusqu'à ~60 s (timeout serveur) : on laisse de la marge.
        timeout: 90000,
      })
      .then((r) => r.data),
  /** « Comprendre avec l'IA » sur une catégorie : explication propre à la catégorie pour le
   *  mois (resservie tant que ses dépenses ne changent pas). */
  explainCategory: (userId: string, period: string, categoryId: string) =>
    api
      .post<CategoryExplanation>(`${path(userId)}/explain/category`, null, {
        params: { period, category_id: categoryId },
        timeout: 90000,
      })
      .then((r) => r.data),
  listAnalyses: (userId: string, opts?: { cursor?: string; limit?: number }) =>
    api
      .get<PaginatedResponse<AIAnalysisStored>>(`${path(userId)}/analyses`, {
        params: { cursor: opts?.cursor, limit: opts?.limit },
      })
      .then((r) => r.data),
  health: (userId: string) =>
    api.get<AIHealth>(`${path(userId)}/health`).then((r) => r.data),
};
