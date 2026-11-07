import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from "react-native";

import { users } from "../src/shared/api/users";
import { useAppStore } from "../src/shared/store";
import { colors } from "../src/ui/theme";

export default function Index() {
  const userId = useAppStore((s) => s.userId);
  const clearAuth = useAppStore((s) => s.clearAuth);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!userId) {
      setChecked(true);
      return;
    }
    let cancelled = false;
    users
      .get(userId)
      .then(() => {
        if (!cancelled) setChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        clearAuth();
        setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, clearAuth]);

  if (!checked) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return userId ? <Redirect href="/dashboard" /> : <Redirect href="/onboarding" />;
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
});