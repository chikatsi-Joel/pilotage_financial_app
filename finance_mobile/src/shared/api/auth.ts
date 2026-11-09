import api from "./client";
import type {
  AuthResponse,
  LoginPayload,
  PendingVerification,
  RegisterPayload,
  User,
  VerifyPayload,
} from "../types";

export const auth = {
  register: (data: RegisterPayload) =>
    api.post<PendingVerification>("/auth/register", data).then((r) => r.data),
  verify: (data: VerifyPayload) =>
    api.post<AuthResponse>("/auth/verify", data).then((r) => r.data),
  resend: (email: string) =>
    api.post("/auth/resend", { email }).then(() => undefined),
  login: (data: LoginPayload) =>
    api.post<AuthResponse>("/auth/login", data).then((r) => r.data),
  me: () => api.get<User>("/auth/me").then((r) => r.data),
  logout: () => api.post("/auth/logout").then(() => undefined),
};
