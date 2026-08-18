import api, { buildPath } from "./client";
import type { Category, CategoryCreate, CategoryUpdate } from "../types";

function path(userId: string, extra?: Record<string, string>) {
  return buildPath("/users/{user_id}/categories", {
    user_id: userId,
    ...extra,
  });
}

export const categories = {
  list: (userId: string) =>
    api.get<Category[]>(path(userId)).then((r) => r.data),
  create: (userId: string, data: CategoryCreate) =>
    api.post<Category>(path(userId), data).then((r) => r.data),
  update: (userId: string, categoryId: string, data: CategoryUpdate) =>
    api
      .put<Category>(
        buildPath("/users/{user_id}/categories/{category_id}", {
          user_id: userId,
          category_id: categoryId,
        }),
        data,
      )
      .then((r) => r.data),
};
