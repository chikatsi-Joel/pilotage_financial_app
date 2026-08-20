import api, { buildPath } from "./client";
import type {
  Budget,
  BudgetSummary,
  BudgetDecision,
  PaginatedResponse,
  Recommendation,
  RecommendationStatus,
} from "../types";

function path(userId: string) {
  return buildPath("/users/{user_id}/budget", { user_id: userId });
}

export const budget = {
  get: (userId: string, period: string) =>
    api
      .get<BudgetSummary>(path(userId), { params: { period } })
      .then((r) => r.data),
  recommend: (userId: string, period: string) =>
    api
      .post<Budget>(`${path(userId)}/recommendation`, null, {
        params: { period },
      })
      .then((r) => r.data),
  decide: (userId: string, period: string, data: BudgetDecision) =>
    api
      .put<BudgetSummary>(`${path(userId)}/decision`, data, {
        params: { period },
      })
      .then((r) => r.data),
  listRecommendations: (
    userId: string,
    period: string,
    opts?: { cursor?: string; limit?: number },
  ) =>
    api
      .get<PaginatedResponse<Recommendation>>(
        `${path(userId)}/recommendations`,
        {
          params: { period, cursor: opts?.cursor, limit: opts?.limit },
        },
      )
      .then((r) => r.data),
  updateRecommendationStatus: (
    userId: string,
    recommendationId: string,
    status: RecommendationStatus,
  ) =>
    api
      .post<Recommendation>(
        buildPath(
          "/users/{user_id}/budget/recommendations/{recommendation_id}/status",
          { user_id: userId, recommendation_id: recommendationId },
        ),
        null,
        { params: { status } },
      )
      .then((r) => r.data),
};
