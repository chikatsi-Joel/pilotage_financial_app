import api, { buildPath } from "./client";
import type { User } from "../types";

export const users = {
  get: (userId: string) =>
    api
      .get<User>(buildPath("/users/{user_id}", { user_id: userId }))
      .then((r) => r.data),
  /** Préférences du compte ; changer de devise ne convertit pas les montants. */
  update: (userId: string, patch: { currency?: string }) =>
    api
      .patch<User>(buildPath("/users/{user_id}", { user_id: userId }), patch)
      .then((r) => r.data),
};
