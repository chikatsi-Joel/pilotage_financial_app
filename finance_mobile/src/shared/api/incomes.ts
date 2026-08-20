import api, { buildPath } from "./client";
import type { Income, IncomeCreate, PaginatedResponse } from "../types";

function path(userId: string) {
  return buildPath("/users/{user_id}/incomes", { user_id: userId });
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
};
