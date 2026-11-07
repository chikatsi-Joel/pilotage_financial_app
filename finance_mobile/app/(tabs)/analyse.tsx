import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { EmptyState, ProgressBar, SearchBar } from "../../src/ui/components";
import { analytics } from "../../src/shared/api/analytics";
import { expenses as expensesApi } from "../../src/shared/api/expenses";
import { useAppStore } from "../../src/shared/store";
import type { CategoryAnalytics, Expense } from "../../src/shared/types";
import { formatMoney } from "../../src/shared/utils/money";
import { colors } from "../../src/ui/theme";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const CATEGORY_ICON: Record<string, IconName> = {
  "Restaurants": "silverware-fork-knife",
  Alimentation: "cart",
  Transport: "car",
  Transports: "car",
  Shopping: "shopping",
  Logement: "home",
  "Logement & Charges": "home",
  Abonnements: "wifi",
  "Sorties & Loisirs": "ticket-confirmation-outline",
  Santé: "medical-bag",
  Épargne: "piggy-bank",
};

function categoryIcon(name: string): IconName {
  return CATEGORY_ICON[name] ?? "tag-outline";
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const label = d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function Depenses() {
  const userId = useAppStore((s) => s.userId);
  const currency = useAppStore((s) => s.currency);
  const period = useAppStore((s) => s.currentPeriod);

  const [searchQuery, setSearchQuery] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cats, setCats] = useState<CategoryAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const catById = useMemo(() => {
    const map = new Map<string, CategoryAnalytics>();
    for (const c of cats) map.set(c.category_id, c);
    return map;
  }, [cats]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      if (!userId) return;
      const [y, m] = period.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const lastDate = `${period}-${String(lastDay).padStart(2, "0")}`;
      const [catData, expData] = await Promise.all([
        analytics.categories(userId, period),
        expensesApi.list(userId, {
          from: `${period}-01`,
          to: lastDate,
          limit: 100,
        }),
      ]);
      setCats(catData);
      setExpenses(expData.items);
    } catch {
      if (!opts?.silent) {
        setExpenses([]);
        setCats([]);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [userId, period]);

  const onRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      await analytics.refresh(userId, period);
    } catch {
      // Rafraîchissement serveur indisponible : on repart des données actuelles.
    }
    await load({ silent: true });
    setRefreshing(false);
  }, [userId, period, load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let items = expenses;
    if (q) {
      items = expenses.filter((e) => {
        const cat = catById.get(e.category_id);
        const hay = `${e.note ?? ""} ${cat?.name ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return items
      .slice()
      .sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1))
      .map((e) => {
        const cat = catById.get(e.category_id);
        const name = cat?.name ?? "Divers";
        const essential = cat?.essential ?? false;
        return {
          id: e.id,
          categoryId: e.category_id,
          title: e.note || "Dépense",
          category: name,
          amount: e.amount,
          date: e.expense_date,
          icon: categoryIcon(name),
          iconBg: essential ? "#DCE9FF" : "#D3BBFF30",
          iconColor: essential ? colors.primary : colors.accent,
          pill: essential ? "Essentielle" : "Optimisable",
          pillBg: essential ? "#DCE9FF" : "#D3BBFF30",
          pillColor: essential ? colors.text : colors.accent,
        };
      });
  }, [expenses, catById, searchQuery]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const existing = map.get(r.date);
      if (existing) existing.push(r);
      else map.set(r.date, [r]);
    }
    return Array.from(map.entries()).map(([day, items]) => ({
      day: dayLabel(day),
      total: items.reduce((s, i) => s + i.amount, 0),
      items,
    }));
  }, [rows]);

  const essentialTotal = useMemo(
    () => cats.filter((c) => c.essential).reduce((s, c) => s + c.current_amount, 0),
    [cats]
  );
  const optimisableTotal = useMemo(
    () => cats.filter((c) => !c.essential).reduce((s, c) => s + c.current_amount, 0),
    [cats]
  );
  const totalExpenses = essentialTotal + optimisableTotal;

  const openEdit = useCallback(
    (tx: (typeof rows)[number]) => {
      router.push({
        pathname: "/add-expense",
        params: {
          id: tx.id,
          amount: String(tx.amount),
          categoryId: tx.categoryId,
          date: tx.date,
          note: tx.title === "Dépense" ? "" : tx.title,
        },
      });
    },
    []
  );

  const confirmDelete = useCallback(
    (tx: (typeof rows)[number]) => {
      if (!userId) return;
      Alert.alert(
        "Supprimer la dépense ?",
        tx.title,
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Supprimer",
            style: "destructive",
            onPress: () => {
              void (async () => {
                try {
                  await expensesApi.delete(userId, tx.id);
                  await load({ silent: true });
                } catch {
                  Alert.alert("Suppression impossible", "Vérifiez que le serveur est démarré.");
                }
              })();
            },
          },
        ]
      );
    },
    [userId, load]
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>Vos dépenses</Text>
          <Text style={styles.headerTitle}>Dépenses</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.analyseBtn}
            onPress={() => router.push("/analyse-insights")}
            hitSlop={6}
            accessibilityLabel="Ouvrir la page Analyse"
            accessibilityRole="button"
          >
            <MaterialCommunityIcons
              color={colors.primary}
              name="chart-timeline-variant-shimmer"
              size={16}
            />
            <Text style={styles.analyseBtnText}>Analyse</Text>
          </Pressable>
          <View style={styles.avatar}>
            <MaterialCommunityIcons color="#FFFFFF" name="account" size={18} />
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Search bar ── */}
        <SearchBar
          placeholder="Rechercher une transaction..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFilterPress={() => {}}
        />

        {/* ── Résumé du mois ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Résumé du mois</Text>
          <Pressable
            style={styles.addCatBtn}
            onPress={() => router.push("/add-expense")}
            hitSlop={6}
            accessibilityLabel="Ajouter une dépense"
            accessibilityRole="button"
          >
            <MaterialCommunityIcons color={colors.primary} name="plus" size={16} />
            <Text style={styles.addCatText}>Ajouter</Text>
          </Pressable>
        </View>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryDecor} />
            <View style={styles.summaryIconRow}>
              <MaterialCommunityIcons
                color={colors.primary}
                name="check-decagram"
                size={16}
              />
              <Text style={styles.summaryLabel}>Essentielles</Text>
            </View>
            <Text style={styles.summaryValue}>{formatMoney(essentialTotal, currency)}</Text>
            <ProgressBar
              progress={totalExpenses > 0 ? (essentialTotal / totalExpenses) * 100 : 0}
              height={4}
              color={colors.primary}
              trackColor="#D3E4FE"
              style={{ marginTop: 4 }}
            />
          </View>
          <View style={[styles.summaryCard, styles.summaryCardTertiary]}>
            <View style={styles.summaryDecorTertiary} />
            <View style={styles.summaryIconRow}>
              <MaterialCommunityIcons
                color={colors.accent}
                name="trending-down"
                size={16}
              />
              <Text style={[styles.summaryLabel, { color: colors.accent }]}>
                Optimisables
              </Text>
            </View>
            <Text style={styles.summaryValue}>{formatMoney(optimisableTotal, currency)}</Text>
            <ProgressBar
              progress={totalExpenses > 0 ? (optimisableTotal / totalExpenses) * 100 : 0}
              height={4}
              color={colors.accent}
              trackColor="#D3BBFF40"
              style={{ marginTop: 4 }}
            />
          </View>
        </View>

        {/* ── Transactions grouped by day ── */}
        {loading && groups.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : groups.length === 0 ? (
          <EmptyState
            icon="text-box-remove-outline"
            title="Aucune dépense"
            subtitle="Ajoutez une dépense pour suivre vos transactions du mois."
          />
        ) : (
          groups.map((group) => (
            <View key={group.day} style={styles.dayGroup}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>{group.day}</Text>
                <Text style={styles.dayTotal}>
                  -{formatMoney(group.total, currency)}
                </Text>
              </View>
              <View style={styles.txList}>
                {group.items.map((tx) => (
                  <Pressable
                    key={tx.id}
                    onPress={() => openEdit(tx)}
                    style={({ pressed }) => [
                      styles.txCard,
                      pressed && styles.txCardPressed,
                    ]}
                  >
                    <View style={[styles.txIcon, { backgroundColor: tx.iconBg }]}>
                      <MaterialCommunityIcons
                        color={tx.iconColor}
                        name={tx.icon}
                        size={22}
                      />
                    </View>
                    <View style={styles.txContent}>
                      <Text style={styles.txTitle} numberOfLines={1}>
                        {tx.title}
                      </Text>
                      <Text style={styles.txCategory} numberOfLines={1}>
                        {tx.category}
                      </Text>
                    </View>
                    <View style={styles.txRight}>
                      <Text style={styles.txAmount}>
                        -{formatMoney(tx.amount, currency)}
                      </Text>
                      <View
                        style={[styles.txPill, { backgroundColor: tx.pillBg }]}
                      >
                        <Text
                          style={[styles.txPillText, { color: tx.pillColor }]}
                        >
                          {tx.pill}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => confirmDelete(tx)}
                      style={({ pressed }) => [
                        styles.txDelete,
                        pressed && styles.txDeletePressed,
                      ]}
                      hitSlop={8}
                      accessibilityLabel="Supprimer la dépense"
                      accessibilityRole="button"
                    >
                      <MaterialCommunityIcons
                        color={colors.textMuted}
                        name="delete-outline"
                        size={18}
                      />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },

  header: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerEyebrow: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  headerTitle: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 2,
  },

  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },

  headerRight: { alignItems: "center", flexDirection: "row", gap: 10 },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  addCatBtn: {
    alignItems: "center",
    backgroundColor: `${colors.primary}12`,
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addCatText: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  analyseBtn: {
    alignItems: "center",
    backgroundColor: `${colors.primary}1A`,
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  analyseBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700",
  },

  content: { gap: 16, padding: 16, paddingTop: 38 },
  loadingBox: { alignItems: "center", paddingVertical: 48 },

  /* Summary */
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 4,
  },
  summaryGrid: { flexDirection: "row", gap: 12 },
  summaryCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    flex: 1,
    gap: 6,
    overflow: "hidden",
    padding: 14,
  },
  summaryCardTertiary: { backgroundColor: "#D3BBFF20" },
  summaryDecor: {
    backgroundColor: `${colors.primary}08`,
    borderRadius: 99,
    height: 80,
    position: "absolute",
    right: -16,
    top: -16,
    width: 80,
  },
  summaryDecorTertiary: {
    backgroundColor: `${colors.accent}10`,
    borderRadius: 99,
    height: 80,
    position: "absolute",
    right: -16,
    top: -16,
    width: 80,
  },
  summaryIconRow: { alignItems: "center", flexDirection: "row", gap: 4 },
  summaryLabel: { color: colors.text, fontSize: 13, fontWeight: "500" },
  summaryValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 28,
  },

  /* Day groups */
  dayGroup: { gap: 10 },
  dayHeader: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dayLabel: { color: colors.textMuted, fontSize: 14, fontWeight: "500" },
  dayTotal: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },

  /* Transactions */
  txList: { gap: 10 },
  txCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  txCardPressed: { opacity: 0.7 },
  txDelete: { padding: 4 },
  txDeletePressed: { opacity: 0.5 },
  accentBar: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 12,
    borderLeftWidth: 4,
    borderColor: colors.primary,
    borderTopLeftRadius: 12,
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
  },
  txIcon: {
    alignItems: "center",
    borderRadius: 99,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  txIconShifted: { marginLeft: 4 },
  txContent: { flex: 1, gap: 2, minWidth: 0 },
  txTitle: { color: colors.text, fontSize: 16, fontWeight: "400" },
  txCategory: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  txRight: { alignItems: "flex-end", gap: 4 },
  txAmount: { color: colors.text, fontSize: 16, fontWeight: "600" },
  txPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  txPillText: { fontSize: 12, fontWeight: "600" },

  /* Bottom nav */
  bottomNav: {
    backgroundColor: "rgba(255,255,255,0.90)",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    paddingBottom: 8,
    paddingTop: 8,
  },
  navItem: { alignItems: "center", flex: 1, gap: 2, justifyContent: "center" },
  navLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  navLabelActive: { color: colors.primary },
});