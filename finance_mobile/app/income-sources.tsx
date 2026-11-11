import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { EmptyState, ScreenHeader } from "../src/ui/components";
import { colors, interFonts } from "../src/ui/theme";
import { incomes as incomesApi } from "../src/shared/api/incomes";
import { useAppStore } from "../src/shared/store";
import { formatMoney } from "../src/shared/utils/money";
import type { Income } from "../src/shared/types";

const SOURCE_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Salaire: "cash-multiple",
  "Remboursement de prêt": "hand-coin-outline",
  Dividende: "trending-up",
};

function sourceIcon(source: string): keyof typeof MaterialCommunityIcons.glyphMap {
  return SOURCE_ICONS[source] ?? "plus-circle-outline";
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00`));
}

export default function IncomeSources() {
  const userId = useAppStore((s) => s.userId);
  const currency = useAppStore((s) => s.currency);

  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (!userId) return;
      const res = await incomesApi.list(userId, { limit: 100 });
      setIncomes(res.items);
    } catch {
      setError(
        "Impossible de charger vos revenus. Vérifiez que le serveur est démarré."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const toggleActive = useCallback(
    async (income: Income) => {
      if (!userId || pendingId) return;
      setPendingId(income.id);
      setError(null);
      const previous = incomes;
      setIncomes((rows) =>
        rows.map((r) =>
          r.id === income.id ? { ...r, active: !r.active } : r
        )
      );
      try {
        const updated = await incomesApi.update(userId, income.id, {
          active: !income.active,
        });
        setIncomes((rows) =>
          rows.map((r) => (r.id === income.id ? updated : r))
        );
      } catch {
        setIncomes(previous);
        setError(
          "Impossible de mettre à jour le revenu. Vérifiez que le serveur est démarré."
        );
      } finally {
        setPendingId(null);
      }
    },
    [userId, pendingId, incomes]
  );

  const editIncome = useCallback((income: Income) => {
    router.push({
      pathname: "/add-income",
      params: {
        incomeId: income.id,
        amount: String(income.amount),
        source: income.source,
        date: income.income_date,
        recurring: String(income.recurring),
      },
    });
  }, []);

  const totalActive = incomes
    .filter((i) => i.active)
    .reduce((sum, i) => sum + i.amount, 0);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScreenHeader
        title="Sources de revenus"
        right={
          <Pressable
            accessibilityLabel="Ajouter un revenu"
            accessibilityRole="button"
            onPress={() => router.push("/add-income")}
            style={({ pressed }) => [
              styles.addBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <MaterialCommunityIcons color="#FFFFFF" name="plus" size={20} />
          </Pressable>
        }
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {error && (
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}

          {incomes.length === 0 ? (
            <EmptyState
              icon="cash-plus"
              title="Aucune source de revenus"
              subtitle="Ajoutez un salaire, un prêt ou un dividende pour suivre vos entrées."
            />
          ) : (
            <>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>
                  Revenus actifs ce mois-ci
                </Text>
                <Text style={styles.summaryValue}>
                  {formatMoney(totalActive, currency)}
                </Text>
                <Text style={styles.summarySub}>
                  {incomes.filter((i) => i.active).length} source(s) active(s)
                  sur {incomes.length}
                </Text>
              </View>

              {incomes.map((income) => {
                const pending = pendingId === income.id;
                const inactive = !income.active;
                return (
                  <View
                    key={income.id}
                    style={[styles.row, inactive && styles.rowInactive]}
                  >
                    <View
                      style={[
                        styles.rowIcon,
                        inactive && styles.rowIconInactive,
                      ]}
                    >
                      <MaterialCommunityIcons
                        color={inactive ? colors.textMuted : colors.primary}
                        name={sourceIcon(income.source)}
                        size={22}
                      />
                    </View>

                    <View style={styles.rowBody}>
                      <Text
                        style={[
                          styles.rowSource,
                          inactive && styles.rowTextInactive,
                        ]}
                        numberOfLines={1}
                      >
                        {income.source}
                      </Text>
                      <View style={styles.rowMeta}>
                        <View
                          style={[
                            styles.chip,
                            income.recurring && styles.chipRecurring,
                          ]}
                        >
                          <Text style={styles.chipText}>
                            {income.recurring ? "Mensuel" : "Ponctuel"}
                          </Text>
                        </View>
                        <Text style={styles.rowDate}>
                          {formatDate(income.income_date)}
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={[
                        styles.rowAmount,
                        inactive && styles.rowTextInactive,
                      ]}
                    >
                      {formatMoney(income.amount, currency)}
                    </Text>

                    <Pressable
                      accessibilityLabel={`Modifier ${income.source}`}
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => editIncome(income)}
                      style={styles.rowEdit}
                    >
                      <MaterialCommunityIcons
                        color={colors.textMuted}
                        name="pencil-outline"
                        size={18}
                      />
                    </Pressable>

                    <Pressable
                      accessibilityRole="switch"
                      accessibilityLabel={`${inactive ? "Activer" : "Désactiver"} ${income.source}`}
                      accessibilityState={{ checked: income.active }}
                      disabled={pending}
                      onPress={() => toggleActive(income)}
                      style={[styles.toggle, income.active && styles.toggleOn]}
                    >
                      <View
                        style={[
                          styles.toggleKnob,
                          income.active && styles.toggleKnobOn,
                        ]}
                      />
                    </Pressable>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  centered: { alignItems: "center", flex: 1, justifyContent: "center" },
  content: { gap: 12, padding: 16, paddingBottom: 32 },

  addBtn: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 99,
    height: 34,
    justifyContent: "center",
    width: 34,
  },

  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontFamily: interFonts.semibold,
  },

  summaryCard: {
    alignItems: "center",
    backgroundColor: "#EFF4FF",
    borderRadius: 16,
    gap: 2,
    paddingVertical: 18,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: interFonts.semibold,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  summaryValue: {
    color: colors.primary,
    fontSize: 24,
    fontFamily: interFonts.bold,
  },
  summarySub: { color: colors.textMuted, fontSize: 11, fontFamily: interFonts.regular },

  row: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  rowInactive: { backgroundColor: "#F4F5FA" },
  rowIcon: {
    alignItems: "center",
    backgroundColor: `${colors.primary}1A`,
    borderRadius: 12,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  rowIconInactive: { backgroundColor: colors.surfaceMuted },
  rowBody: { flex: 1, gap: 6 },
  rowSource: {
    color: colors.text,
    fontSize: 14,
    fontFamily: interFonts.bold,
  },
  rowTextInactive: { color: colors.textMuted },
  rowMeta: { alignItems: "center", flexDirection: "row", gap: 8 },
  chip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chipRecurring: { backgroundColor: "#DDF5E9" },
  chipText: { color: colors.textMuted, fontSize: 10, fontFamily: interFonts.bold },
  rowDate: { color: colors.textMuted, fontSize: 11, fontFamily: interFonts.regular },
  rowAmount: {
    color: colors.text,
    fontSize: 14,
    fontFamily: interFonts.bold,
  },
  rowEdit: { padding: 2 },

  toggle: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 99,
    height: 28,
    justifyContent: "center",
    padding: 3,
    width: 48,
  },
  toggleOn: { backgroundColor: colors.primary },
  toggleKnob: {
    backgroundColor: "#FFFFFF",
    borderRadius: 99,
    height: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    width: 22,
  },
  toggleKnobOn: { alignSelf: "flex-end" },
});