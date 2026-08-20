import api, { buildPath } from "./client";
import type { Expense, ExpenseCreate, PaginatedResponse } from "../types";

function path(userId: string, extra?: Record<string, string>) {
  return buildPath("/users/{user_id}/expenses", {
    user_id: userId,
    ...extra,
  });
}

export const expenses = {
  list: (
    userId: string,
    opts?: {
      from?: string;
      to?: string;
      categoryId?: string;
      cursor?: string;
      limit?: number;
    },
  ) =>
    api
      .get<PaginatedResponse<Expense>>(path(userId), {
        params: {
          from_date: opts?.from,
          to_date: opts?.to,
          category_id: opts?.categoryId,
          cursor: opts?.cursor,
          limit: opts?.limit,
        },
      })
      .then((r) => r.data),
  create: (userId: string, data: ExpenseCreate) =>
    api.post<Expense>(path(userId), data).then((r) => r.data),
  update: (userId: string, expenseId: string, data: ExpenseCreate) =>
    api
      .put<Expense>(
        buildPath("/users/{user_id}/expenses/{expense_id}", {
          user_id: userId,
          expense_id: expenseId,
        }),
        data,
      )
      .then((r) => r.data),
  delete: (userId: string, expenseId: string) =>
    api
      .delete(
        buildPath("/users/{user_id}/expenses/{expense_id}", {
          user_id: userId,
          expense_id: expenseId,
        }),
      )
      .then(() => undefined),
};
