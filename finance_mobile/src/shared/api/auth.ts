import api from "./client";
import type { AuthResponse, LoginPayload, RegisterPayload, User } from "../types";

export const auth = {
  register: (data: RegisterPayload) =>
    api.post<AuthResponse>("/auth/register", data).then((r) => r.data),
  login: (data: LoginPayload) =>
    api.post<AuthResponse>("/auth/login", data).then((r) => r.data),
  me: () => api.get<User>("/auth/me").then((r) => r.data),
  logout: () => api.post("/auth/logout").then(() => undefined),
};
