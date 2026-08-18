import api, { buildPath } from "./client";
import type { Expense, ExpenseCreate } from "../types";

function path(userId: string, extra?: Record<string, string>) {
  return buildPath("/users/{user_id}/expenses", {
    user_id: userId,
    ...extra,
  });
}

export const expenses = {
  list: (userId: string, from?: string, to?: string, categoryId?: string) =>
    api
      .get<Expense[]>(path(userId), {
        params: { from_date: from, to_date: to, category_id: categoryId },
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
