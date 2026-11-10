import api, { buildPath } from "./client";
import type { Expense, ExpenseCreate, PaginatedResponse } from "../types";

function path(userId: string, extra?: Record<string, string>) {
  return buildPath("/users/{user_id}/expenses", {
    user_id: userId,
    ...extra,
  });
}

/** Total dépensé un jour donné (agrégé côté serveur). */
export interface DailyTotal {
  date: string;
  total: number;
}

export const expenses = {
  daily: (
    userId: string,
    opts: { from: string; to: string; categoryId?: string },
  ) =>
    api
      .get<DailyTotal[]>(`${path(userId)}/daily`, {
        params: { from_date: opts.from, to_date: opts.to, category_id: opts.categoryId },
      })
      .then((r) => r.data),
  list: (
    userId: string,
    opts?: {
      from?: string;
      to?: string;
      categoryId?: string;
      q?: string;
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
          q: opts?.q,
          cursor: opts?.cursor,
          limit: opts?.limit,
        },
      })
      .then((r) => r.data),
  create: (userId: string, data: ExpenseCreate) =>
    api.post<Expense>(path(userId), data).then((r) => r.data),
  /** Crée toutes les dépenses en une transaction (tout ou rien). */
  createMany: (userId: string, items: ExpenseCreate[]) =>
    api
      .post<Expense[]>(`${path(userId)}/bulk`, { items })
      .then((r) => r.data),
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
