import axios from "axios";
import Constants from "expo-constants";

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

export type PathParameters = Record<string, string | number>;

export function buildPath(
  template: string,
  parameters: PathParameters,
): string {
  return template.replace(/\{([^}]+)\}/g, (_placeholder, name: string) => {
    const value = parameters[name];
    if (value === undefined || value === null || value === "") {
      throw new Error(`Missing path parameter '${name}' for ${template}`);
    }
    return encodeURIComponent(String(value));
  });
}

export default api;
