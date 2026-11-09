import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { notifications as api } from "../src/shared/api/notifications";
import { pushPermission, registerForPush, type PushStatus } from "../src/shared/notifications/push";
import { useAppStore } from "../src/shared/store";
import type { NotificationPreferences } from "../src/shared/types";
import { formatHour, stepHour } from "../src/shared/utils/notificationPrefs";
import { ScreenHeader } from "../src/ui/components";
import { colors } from "../src/ui/theme";

type Toggle = "budget_alerts" | "savings_milestones" | "weekly_summary" | "ai_insights" | "daily_reminder";

const ROWS: { key: Toggle; title: string; subtitle: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  {
    key: "budget_alerts",
    title: "Alertes de budget",
    subtitle: "Quand une catégorie atteint 80 % puis 100 % de son budget.",
    icon: "alert-circle-outline",
  },
  {
    key: "savings_milestones",
    title: "Objectifs d'épargne",
    subtitle: "À 50 % et à 100 % de votre objectif.",
    icon: "piggy-bank-outline",
  },
  {
    key: "weekly_summary",
    title: "Résumé hebdomadaire",
    subtitle: "Chaque dimanche soir : dépenses de la semaine et solde.",
    icon: "calendar-week",
  },
  {
    key: "ai_insights",
    title: "Conseils de l'IA",
    subtitle: "Un conseil par semaine, quand l'analyse en produit un.",
    icon: "star-four-points-outline",
  },
];

export default function NotificationSettings() {
  const userId = useAppStore((s) => s.userId);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [permission, setPermission] = useState<PushStatus>("granted");
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setPrefs(await api.getPreferences(userId));
      setPermission(await pushPermission());
      setError(null);
    } catch {
      setError("Impossible de charger vos préférences. Vérifiez la connexion.");
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = useCallback(
    async (change: Partial<NotificationPreferences>) => {
      if (!userId || !prefs) return;
      const previous = prefs;
      setPrefs({ ...prefs, ...change }); // affichage immédiat
      setError(null);
      try {
        setPrefs(await api.updatePreferences(userId, change));
      } catch {
        setPrefs(previous);
        setError("Modification non enregistrée. Réessayez.");
      }
    },
    [userId, prefs],
  );

  const enable = useCallback(async () => {
    if (!userId) return;
    setPermission(await registerForPush(userId));
  }, [userId]);

  const sendTest = useCallback(async () => {
    if (!userId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const { sent } = await api.sendTest(userId);
      setTestResult(
        sent > 0
          ? "Notification envoyée : elle devrait arriver dans quelques secondes."
          : "Aucun appareil enregistré. Activez les notifications ci-dessus.",
      );
    } catch {
      setTestResult("Envoi impossible pour le moment.");
    } finally {
      setTesting(false);
    }
  }, [userId]);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScreenHeader title="Notifications" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {permission !== "granted" && (
          <View style={styles.banner}>
            <MaterialCommunityIcons color={colors.warning} name="bell-off-outline" size={22} />
            <View style={styles.bannerCopy}>
              <Text style={styles.bannerTitle}>
                {permission === "unsupported"
                  ? "Indisponible sur ce type d'appareil"
                  : permission === "unavailable"
                    ? "Configuration incomplète"
                    : "Notifications désactivées"}
              </Text>
              <Text style={styles.bannerText}>
                {permission === "unsupported"
                  ? "Les notifications nécessitent un vrai téléphone (pas un simulateur)."
                  : permission === "unavailable"
                    ? "Le jeton de notification n'a pas pu être créé. Vérifiez la configuration du projet."
                    : "Autorisez-les pour recevoir vos alertes."}
              </Text>
              {permission === "denied" && (
                <View style={styles.bannerActions}>
                  <Pressable onPress={enable} style={styles.bannerBtn}>
                    <Text style={styles.bannerBtnText}>Activer</Text>
                  </Pressable>
                  <Pressable onPress={() => void Linking.openSettings()}>
                    <Text style={styles.link}>Ouvrir les réglages</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {!prefs && !error ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : null}

        {prefs && (
          <>
            <View style={styles.card}>
              {ROWS.map((row, i) => (
                <View key={row.key} style={[styles.row, i > 0 && styles.rowBorder]}>
                  <MaterialCommunityIcons color={colors.primary} name={row.icon} size={22} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{row.title}</Text>
                    <Text style={styles.rowSub}>{row.subtitle}</Text>
                  </View>
                  <Switch
                    accessibilityLabel={row.title}
                    onValueChange={(value) => void update({ [row.key]: value })}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    value={prefs[row.key]}
                  />
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <View style={styles.row}>
                <MaterialCommunityIcons color={colors.primary} name="bell-ring-outline" size={22} />
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>Rappel quotidien</Text>
                  <Text style={styles.rowSub}>
                    Un rappel pour noter vos dépenses, sauf si c'est déjà fait.
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="Rappel quotidien"
                  onValueChange={(value) => void update({ daily_reminder: value })}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  value={prefs.daily_reminder}
                />
              </View>
              {prefs.daily_reminder && (
                <View style={[styles.row, styles.rowBorder, styles.hourRow]}>
                  <Text style={styles.rowTitle}>Heure du rappel</Text>
                  <View style={styles.stepper}>
                    <Pressable
                      accessibilityLabel="Une heure plus tôt"
                      hitSlop={8}
                      onPress={() =>
                        void update({ daily_reminder_hour: stepHour(prefs.daily_reminder_hour, -1) })
                      }
                      style={styles.stepBtn}
                    >
                      <MaterialCommunityIcons color={colors.primary} name="minus" size={18} />
                    </Pressable>
                    <Text style={styles.hour}>{formatHour(prefs.daily_reminder_hour)}</Text>
                    <Pressable
                      accessibilityLabel="Une heure plus tard"
                      hitSlop={8}
                      onPress={() =>
                        void update({ daily_reminder_hour: stepHour(prefs.daily_reminder_hour, 1) })
                      }
                      style={styles.stepBtn}
                    >
                      <MaterialCommunityIcons color={colors.primary} name="plus" size={18} />
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <Text style={styles.tz}>Fuseau horaire : {prefs.timezone}</Text>

            <Pressable
              accessibilityRole="button"
              disabled={testing}
              onPress={sendTest}
              style={[styles.testBtn, testing && { opacity: 0.6 }]}
            >
              {testing ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.testText}>Envoyer une notification de test</Text>
              )}
            </Pressable>
            {testResult && <Text style={styles.testResult}>{testResult}</Text>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scroll: { gap: 16, padding: 16, paddingBottom: 40 },
  banner: {
    backgroundColor: colors.warningSoft,
    borderRadius: 16,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  bannerCopy: { flex: 1, gap: 4 },
  bannerTitle: { color: colors.warning, fontSize: 15, fontWeight: "700" },
  bannerText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  bannerActions: { alignItems: "center", flexDirection: "row", gap: 16, marginTop: 6 },
  bannerBtn: {
    backgroundColor: colors.primary,
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bannerBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  link: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: { alignItems: "center", flexDirection: "row", gap: 12, padding: 16 },
  rowBorder: { borderTopColor: colors.border, borderTopWidth: 1 },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  rowSub: { color: colors.textMuted, fontSize: 12, lineHeight: 16 },
  hourRow: { justifyContent: "space-between" },
  stepper: { alignItems: "center", flexDirection: "row", gap: 14 },
  stepBtn: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 99,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  hour: { color: colors.text, fontSize: 17, fontWeight: "700", minWidth: 56, textAlign: "center" },
  tz: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
  testBtn: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    paddingVertical: 14,
  },
  testText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
  testResult: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
});
