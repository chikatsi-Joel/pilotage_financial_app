import { useEffect, useState } from "react";
import { router } from "expo-router";
import {
  Alert,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { users } from "../src/shared/api/users";
import { useAppStore } from "../src/shared/store";
import { BrandMark } from "../src/ui/components";
import { colors } from "../src/ui/theme";
import type { User } from "../src/shared/types";

export default function Onboarding() {
  const setAuth = useAppStore((s) => s.setAuth);
  const [creating, setCreating] = useState(false);
  const [existing, setExisting] = useState<User[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    users
      .list()
      .then((res) => {
        if (!cancelled) setExisting(res);
      })
      .catch(() => {
        if (!cancelled) setExisting([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function start() {
    setCreating(true);
    try {
      const user = await users.create({
        name: "Utilisateur",
        currency: "XAF",
      });
      setAuth(user.id, user.name, user.currency);
      router.replace("/dashboard");
    } catch {
      setCreating(false);
      Alert.alert(
        "Serveur injoignable",
        "Démarrez le backend (uvicorn app.main:app) puis réessayez."
      );
    }
  }

  function resume(user: User) {
    setAuth(user.id, user.name, user.currency);
    router.replace("/dashboard");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <BrandMark />
          <View style={styles.copy}>
            <Text style={styles.title}>Bienvenue sur{`\n`}<Text style={styles.brand}>Pilotage</Text></Text>
            <Text style={styles.subtitle}>Prenez le contrôle de votre avenir financier avec une analyse intelligente et sereine.</Text>
          </View>
        </View>
        <View style={styles.bottom}>
          {existing.length > 0 && (
            <>
              <View style={styles.existingHeader}>
                <Text style={styles.existingTitle}>Vos comptes</Text>
                {loadingExisting && (
                  <ActivityIndicator color={colors.primary} size="small" />
                )}
              </View>
              <View style={styles.existingList}>
                {existing.slice(0, 3).map((user) => (
                  <Pressable
                    key={user.id}
                    onPress={() => resume(user)}
                    style={styles.existingRow}
                  >
                    <View style={styles.existingAvatar}>
                      <Text style={styles.existingAvatarText}>
                        {user.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.existingCopy}>
                      <Text style={styles.existingName}>{user.name}</Text>
                      <Text style={styles.existingMeta}>
                        {user.currency} · continuer l'activité
                      </Text>
                    </View>
                    <MaterialCommunityIcons
                      color={colors.textMuted}
                      name="chevron-right"
                      size={20}
                    />
                  </Pressable>
                ))}
              </View>
            </>
          )}
          <View style={styles.dots}><View style={[styles.dot, styles.dotActive]} /><View style={styles.dot} /><View style={styles.dot} /></View>
          <Pressable
            onPress={start}
            disabled={creating}
            style={[styles.button, creating && styles.buttonDisabled]}
          >
            {creating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Commencer</Text>
            )}
          </Pressable>
          <Text style={styles.helper}>Une vision plus claire, à votre rythme.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bottom: { gap: 18 },
  brand: { color: colors.primary },
  button: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 17, shadowColor: colors.primary, shadowOpacity: 0.22, shadowRadius: 12 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  content: { flex: 1, justifyContent: "space-between", padding: 24 },
  copy: { alignItems: "center", gap: 16 },
  dot: { backgroundColor: "#D4D1EE", borderRadius: 4, height: 7, width: 7 },
  dotActive: { backgroundColor: colors.primary, width: 24 },
  dots: { flexDirection: "row", gap: 7, justifyContent: "center" },
  existingAvatar: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  existingAvatarText: { color: colors.primary, fontSize: 15, fontWeight: "800" },
  existingCopy: { flex: 1, gap: 2 },
  existingHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  existingList: { gap: 10 },
  existingMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "500" },
  existingName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  existingRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#EEEAF8",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  existingTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  helper: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
  hero: { alignItems: "center", flex: 1, justifyContent: "center", gap: 42 },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  subtitle: { color: colors.textMuted, fontSize: 17, lineHeight: 26, maxWidth: 325, textAlign: "center" },
  title: { color: colors.text, fontSize: 35, fontWeight: "800", letterSpacing: -1, textAlign: "center" },
});
