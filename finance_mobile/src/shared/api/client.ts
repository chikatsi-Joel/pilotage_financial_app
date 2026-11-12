import axios from "axios";

import { getToken, notifyUnauthorized } from "../auth/session";
import { apiBaseUrl } from "./baseUrl";

const api = axios.create({
  baseURL: apiBaseUrl(),
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  // Adresse lue à chaque requête : elle peut changer via Firebase Remote Config.
  config.baseURL = apiBaseUrl();
  const token = getToken();
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

/** Les erreurs de connexion/inscription renvoient 401 sans que la session soit perdue. */
const PUBLIC_PATHS = ["/auth/login", "/auth/register", "/auth/verify", "/auth/firebase"];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error?.config?.url ?? "";
    if (error?.response?.status === 401 && !PUBLIC_PATHS.some((p) => url.startsWith(p))) {
      notifyUnauthorized();
    }
    return Promise.reject(error);
  },
);

export { buildPath, type PathParameters } from "./path";

export default api;
