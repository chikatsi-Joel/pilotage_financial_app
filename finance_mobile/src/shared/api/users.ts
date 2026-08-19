import api, { buildPath } from "./client";
import type { User, UserCreate } from "../types";



export const users = {
  create: (data: UserCreate) =>
    api.post<User>("/users", data).then((r) => r.data),
  get: (userId: string) =>
    api
      .get<User>(buildPath("/users/{user_id}", { user_id: userId }))
      .then((r) => r.data),
};
