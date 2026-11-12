import axios from "axios";

import { apiOrigin } from "./baseUrl";

export interface SystemHealth {
  status: string;
}

// Le healthcheck racine du backend est servi hors du préfixe /api/v1.
const systemClient = axios.create({ timeout: 10000 });
systemClient.interceptors.request.use((config) => {
  config.baseURL = apiOrigin();
  return config;
});

export const system = {
  health: () => systemClient.get<SystemHealth>("/health").then((r) => r.data),
};