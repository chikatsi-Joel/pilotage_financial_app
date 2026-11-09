import api, { buildPath } from "./client";
import type { User } from "../types";

export const users = {
  get: (userId: string) =>
    api
      .get<User>(buildPath("/users/{user_id}", { user_id: userId }))
      .then((r) => r.data),
};
