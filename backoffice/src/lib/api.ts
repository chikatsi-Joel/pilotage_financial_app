/** Client de l'API admin : cookie de session (httpOnly) + en-tête anti-CSRF sur chaque appel. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Json = Record<string, unknown> | unknown[];

async function request<T>(method: string, path: string, body?: Json): Promise<T> {
  const res = await fetch(`/admin/api${path}`, {
    method,
    credentials: "same-origin",
    headers: { "X-Lucia-Admin": "1", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && path !== "/login") {
    window.dispatchEvent(new Event("lucia:unauthorized"));
  }
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail)) message = "Champs invalides";
    } catch {
      /* réponse sans JSON */
    }
    throw new ApiError(res.status, message);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: Json) => request<T>("POST", path, body),
  put: <T>(path: string, body?: Json) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

// ── Types des réponses ──────────────────────────────────────────────────

export interface Overview {
  generated_at: string;
  users_total: number;
  users_new_30d: number;
  users_new_delta: number | null;
  active_today: number;
  active_7d: number;
  active_30d: number;
  active_30d_delta: number | null;
  push_devices: number;
  users_with_push: number;
  notifications_30d: number;
  notifications_delta: number | null;
  expenses_30d: number;
  series: { day: string; active: number; signups: number; notifications: number }[];
}

export interface NotificationStats {
  push_enabled: boolean;
  days: number;
  by_kind: { kind: string; label: string; count: number }[];
  devices: { platform: string; count: number }[];
  users_with_push: number;
}

export interface NotificationItem {
  id: string;
  key: string;
  kind: string;
  label: string;
  created_at: string;
  user_email: string | null;
  user_name: string;
}

export interface FlagParam {
  key: string;
  group: string | null;
  value_type: "STRING" | "BOOLEAN" | "NUMBER" | "JSON";
  description: string;
  value: string | null;
  in_app_default: boolean;
  conditional: { condition: string; value: string | null; rollout: boolean }[];
}

export interface Flags {
  project: string;
  version: string | null;
  updated_at: string | null;
  updated_by: string | null;
  conditions: { name: string; expression: string }[];
  parameters: FlagParam[];
}

export interface SqlQueryStat {
  id: string;
  query: string;
  calls: number;
  total_ms: number;
  mean_ms: number;
  max_ms: number;
  stddev_ms: number;
  rows: number;
  share: number;
  cache_hit_ratio: number | null;
}

export type SqlStats =
  | { available: false; reason: string }
  | {
      available: true;
      reason?: undefined;
      since: string | null;
      statements: number;
      calls: number;
      total_ms: number;
      cache_hit_ratio: number | null;
      queries: SqlQueryStat[];
    };

export interface Setting {
  key: string;
  label: string;
  description: string;
  secret: boolean;
  multiline: boolean;
  known: boolean;
  value: string;
  source: "database" | "environment" | "unset" | "unreadable";
  updated_at: string | null;
  updated_by: string | null;
}
