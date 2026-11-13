import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

interface AuthState {
  email: string | null;
  checking: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api
      .get<{ email: string }>("/me")
      .then((me) => setEmail(me.email))
      .catch(() => setEmail(null))
      .finally(() => setChecking(false));
    // Session expirée pendant l'utilisation : retour à l'écran de connexion.
    const onUnauthorized = () => setEmail(null);
    window.addEventListener("lucia:unauthorized", onUnauthorized);
    return () => window.removeEventListener("lucia:unauthorized", onUnauthorized);
  }, []);

  const login = useCallback(async (address: string, password: string) => {
    const me = await api.post<{ email: string }>("/login", { email: address, password });
    setEmail(me.email);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/logout");
    } finally {
      setEmail(null);
    }
  }, []);

  return <AuthContext.Provider value={{ email, checking, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth hors de AuthProvider");
  return ctx;
}
