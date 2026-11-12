import api from "./client";
import type {
  AuthResponse,
  FirebaseSignInPayload,
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
  /** Échange l'ID token Firebase ; `legacyToken` rattache un compte ouvert avec l'ancienne connexion. */
  firebase: (data: FirebaseSignInPayload, legacyToken?: string) =>
    api
      .post<AuthResponse | PendingVerification>("/auth/firebase", data, {
        headers: legacyToken ? { Authorization: `Bearer ${legacyToken}` } : undefined,
      })
      .then((r) => r.data),
  firebaseVerify: (idToken: string, code: string) =>
    api.post<AuthResponse>("/auth/firebase/verify", { id_token: idToken, code }).then((r) => r.data),
  firebaseResend: (idToken: string) =>
    api.post("/auth/firebase/resend", { id_token: idToken }).then(() => undefined),
  /** Ferme une session précise (celle de l'ancienne connexion après migration). */
  logoutToken: (token: string) =>
    api.post("/auth/logout", undefined, { headers: { Authorization: `Bearer ${token}` } }).then(() => undefined),
  me: () => api.get<User>("/auth/me").then((r) => r.data),
  logout: () => api.post("/auth/logout").then(() => undefined),
};
