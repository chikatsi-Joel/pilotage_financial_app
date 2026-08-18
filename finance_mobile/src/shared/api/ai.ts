import api, { buildPath } from "./client";
import type { AIAnalysis, AIAnalysisStored, AIHealth } from "../types";

function path(userId: string) {
  return buildPath("/users/{user_id}/ai", { user_id: userId });
}

export const ai = {
  analyze: (userId: string, period: string) =>
    api
      .post<AIAnalysis>(`${path(userId)}/analyze`, null, {
        params: { period },
      })
      .then((r) => r.data),
  listAnalyses: (userId: string) =>
    api
      .get<AIAnalysisStored[]>(`${path(userId)}/analyses`)
      .then((r) => r.data),
  health: (userId: string) =>
    api.get<AIHealth>(`${path(userId)}/health`).then((r) => r.data),
};
