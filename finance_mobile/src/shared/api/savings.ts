import api, { buildPath } from "./client";
import type {
  PaginatedResponse,
  SavingsGoal,
  SavingsGoalContributeRead,
  SavingsGoalCreate,
} from "../types";

function path(userId: string, extra?: Record<string, string>) {
  return buildPath("/users/{user_id}/savings-goals", {
    user_id: userId,
    ...extra,
  });
}

export const savings = {
  list: (userId: string, opts?: { cursor?: string; limit?: number }) =>
    api
      .get<PaginatedResponse<SavingsGoal>>(path(userId), {
        params: { cursor: opts?.cursor, limit: opts?.limit },
      })
      .then((r) => r.data),
  create: (userId: string, data: SavingsGoalCreate) =>
    api.post<SavingsGoal>(path(userId), data).then((r) => r.data),
  contribute: (userId: string, goalId: string, amount: number) =>
    api
      .post<SavingsGoalContributeRead>(
        buildPath("/users/{user_id}/savings-goals/{goal_id}/contribute", {
          user_id: userId,
          goal_id: goalId,
        }),
        { amount },
      )
      .then((r) => r.data),
};
