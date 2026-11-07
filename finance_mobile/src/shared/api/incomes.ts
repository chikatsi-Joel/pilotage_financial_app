import api, { buildPath } from "./client";
import type {
  Income,
  IncomeCreate,
  IncomeUpdate,
  PaginatedResponse,
} from "../types";

function path(userId: string) {
  return buildPath("/users/{user_id}/incomes", { user_id: userId });
}

function itemPath(userId: string, incomeId: string) {
  return buildPath("/users/{user_id}/incomes/{income_id}", {
    user_id: userId,
    income_id: incomeId,
  });
}

export const incomes = {
  list: (
    userId: string,
    opts?: { from?: string; to?: string; cursor?: string; limit?: number },
  ) =>
    api
      .get<PaginatedResponse<Income>>(path(userId), {
        params: {
          from_date: opts?.from,
          to_date: opts?.to,
          cursor: opts?.cursor,
          limit: opts?.limit,
        },
      })
      .then((r) => r.data),
  create: (userId: string, data: IncomeCreate) =>
    api.post<Income>(path(userId), data).then((r) => r.data),
  update: (userId: string, incomeId: string, data: IncomeUpdate) =>
    api.put<Income>(itemPath(userId, incomeId), data).then((r) => r.data),
};
