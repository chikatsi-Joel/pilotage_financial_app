import { create } from "zustand";

import { NO_FLAGS, type RemoteFlags } from "../utils/remoteFlags";
import { DEFAULT_TOURS, type TourScreen, type TourStep } from "../utils/tour";

export interface RemoteState extends RemoteFlags {
  tour: { enabled: boolean; version: number; steps: Record<TourScreen, TourStep[]> };
}

/** Maintenance, annonce et visites guidées venues de Remote Config ; mises à jour en temps réel. */
export const useRemoteFlags = create<RemoteState>(() => ({
  ...NO_FLAGS,
  tour: { enabled: true, version: 1, steps: DEFAULT_TOURS },
}));
