import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface AppState {
  userId: string | null;
  userName: string | null;
  currency: string;
  currentPeriod: string;
  setAuth: (userId: string, name: string, currency: string) => void;
  clearAuth: () => void;
  setPeriod: (period: string) => void;
}

function currentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      userId: null,
      userName: null,
      currency: "XAF",
      currentPeriod: currentMonth(),

      setAuth: (userId, name, currency) =>
        set({ userId, userName: name, currency }),

      clearAuth: () =>
        set({ userId: null, userName: null, currency: "XAF" }),

      setPeriod: (period) => set({ currentPeriod: period }),
    }),
    {
      name: "finance-app-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
