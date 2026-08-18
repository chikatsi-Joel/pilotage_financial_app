import api, { buildPath } from "./client";
import type { Income, IncomeCreate } from "../types";

function path(userId: string) {
  return buildPath("/users/{user_id}/incomes", { user_id: userId });
}

export const incomes = {
  list: (userId: string, from?: string, to?: string) =>
    api
      .get<Income[]>(path(userId), {
        params: { from_date: from, to_date: to },
      })
      .then((r) => r.data),
  create: (userId: string, data: IncomeCreate) =>
    api.post<Income>(path(userId), data).then((r) => r.data),
};
