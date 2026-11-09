import axios from "axios";
import Constants from "expo-constants";

import { getToken, notifyUnauthorized } from "../auth/session";

const envUrl = process.env.EXPO_PUBLIC_API_URL;

const devHost = Constants.expoConfig?.hostUri?.split(":")[0];

const baseURL = devHost
  ? `http://${devHost}:8000/api/v1`
  : envUrl || "http://localhost:8000/api/v1";

const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

/** Les erreurs de connexion/inscription renvoient 401 sans que la session soit perdue. */
const PUBLIC_PATHS = ["/auth/login", "/auth/register"];

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
