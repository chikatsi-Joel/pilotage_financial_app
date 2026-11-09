import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { auth } from "../src/shared/api/auth";
import { loadToken } from "../src/shared/auth/session";
import { registerForPush } from "../src/shared/notifications/push";
import { useAppStore } from "../src/shared/store";
import { colors } from "../src/ui/theme";

/**
 * Démarrage : la session est conservée tant que l'utilisateur ne se déconnecte pas.
 * Seule une réponse 401 (session révoquée) ferme la session ; une panne réseau ou
 * serveur laisse l'utilisateur dans l'application.
 */
export default function Index() {
  const setAuth = useAppStore((s) => s.setAuth);
  const clearAuth = useAppStore((s) => s.clearAuth);
  const [target, setTarget] = useState<"/dashboard" | "/onboarding" | null>(null);

  useEffect(() => {
    let cancelled = false;
    const finish = (to: "/dashboard" | "/onboarding") => {
      if (!cancelled) setTarget(to);
    };

    (async () => {
      const token = await loadToken();
      if (!token) {
        clearAuth();
        finish("/onboarding");
        return;
      }
      try {
        const me = await auth.me();
        setAuth(me.id, me.name, me.currency);
        void registerForPush(me.id);
        finish("/dashboard");
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 401) {
          clearAuth();
          finish("/onboarding");
        } else {
          // Hors ligne : on garde la session et l'identité mémorisée.
          finish(useAppStore.getState().userId ? "/dashboard" : "/onboarding");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setAuth, clearAuth]);

  if (!target) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return <Redirect href={target} />;
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
});
