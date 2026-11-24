import api, { buildPath } from "./client";
import type { BillingStatus } from "../types";

function path(userId: string) {
  return buildPath("/users/{user_id}/billing", { user_id: userId });
}

export const billing = {
  /** État Premium ; le serveur relit au passage un abonnement renouvelé auprès de Google. */
  status: (userId: string) => api.get<BillingStatus>(path(userId)).then((r) => r.data),
  /** Vérification d'un achat Google Play par le serveur (seul juge de sa validité). */
  verifyGoogle: (userId: string, purchaseToken: string) =>
    api
      .post<BillingStatus>(`${path(userId)}/google/verify`, { purchase_token: purchaseToken })
      .then((r) => r.data),
};
