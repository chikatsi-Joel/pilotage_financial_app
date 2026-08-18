import api, { buildPath } from "./client";
import type {
  Dashboard,
  CategoryAnalytics,
  AnalyticsRefreshResult,
} from "../types";

function path(userId: string) {
  return buildPath("/users/{user_id}/analytics", { user_id: userId });
}

export const analytics = {
  dashboard: (userId: string, period: string) =>
    api
      .get<Dashboard>(`${path(userId)}/dashboard`, { params: { period } })
      .then((r) => r.data),
  categories: (userId: string, period: string) =>
    api
      .get<CategoryAnalytics[]>(`${path(userId)}/categories`, {
        params: { period },
      })
      .then((r) => r.data),
  refresh: (userId: string, period: string) =>
    api
      .post<AnalyticsRefreshResult>(`${path(userId)}/refresh`, null, {
        params: { period },
      })
      .then((r) => r.data),
};
