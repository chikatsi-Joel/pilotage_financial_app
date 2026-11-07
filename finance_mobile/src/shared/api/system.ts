import axios from "axios";
import Constants from "expo-constants";

export interface SystemHealth {
  status: string;
}

const envUrl = process.env.EXPO_PUBLIC_API_URL;
const devHost = Constants.expoConfig?.hostUri?.split(":")[0];

// Le healthcheck racine du backend est servi hors du préfixe /api/v1.
const origin = devHost
  ? `http://${devHost}:8000`
  : envUrl?.replace(/\/api\/v1\/?$/, "") || "http://localhost:8000";

const systemClient = axios.create({
  baseURL: origin,
  timeout: 10000,
});

export const system = {
  health: () => systemClient.get<SystemHealth>("/health").then((r) => r.data),
};