import api, { buildPath } from "./client";
import type { NotificationPreferences } from "../types";

function path(userId: string) {
  return buildPath("/users/{user_id}/notifications", { user_id: userId });
}

export const notifications = {
  registerDevice: (
    userId: string,
    data: { token: string; platform: string; timezone: string },
  ) => api.post(`${path(userId)}/devices`, data).then(() => undefined),
  unregisterDevice: (userId: string, token: string) =>
    api
      .post(`${path(userId)}/devices/unregister`, { token }, { timeout: 5000 })
      .then(() => undefined),
  getPreferences: (userId: string) =>
    api.get<NotificationPreferences>(`${path(userId)}/preferences`).then((r) => r.data),
  updatePreferences: (userId: string, data: Partial<NotificationPreferences>) =>
    api.put<NotificationPreferences>(`${path(userId)}/preferences`, data).then((r) => r.data),
  sendTest: (userId: string) =>
    api.post<{ sent: number }>(`${path(userId)}/test`).then((r) => r.data),
};
