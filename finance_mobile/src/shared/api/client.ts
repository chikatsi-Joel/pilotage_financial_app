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

export { buildPath, type PathParameters } from "./path";

export default api;
