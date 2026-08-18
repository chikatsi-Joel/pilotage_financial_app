import api, { buildPath } from "./client";
import type { WhatIfResult, WhatIfRequest } from "../types";

function path(userId: string) {
  return buildPath("/users/{user_id}/what-if", { user_id: userId });
}

export const whatIf = {
  simulate: (userId: string, period: string, data: WhatIfRequest) =>
    api
      .post<WhatIfResult>(path(userId), data, { params: { period } })
      .then((r) => r.data),
};
