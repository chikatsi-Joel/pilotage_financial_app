import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
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
import { usePagedExpenses } from "../../src/shared/hooks/usePagedExpenses";
import { useAppStore } from "../../src/shared/store";
import type { CategoryAnalytics } from "../../src/shared/types";
import { groupByDate } from "../../src/shared/utils/paging";
import { formatMoney } from "../../src/shared/utils/money";
import { colors, interFonts } from "../../src/ui/theme";
import { expenseTag, type ExpenseTagKind } from "../../src/shared/utils/optimization";

/** Couleurs des étiquettes : essentielle (bleu), optimisable (violet), autre (gris). */
const TAG_TONE: Record<ExpenseTagKind, { bg: string; fg: string }> = {
  essential: { bg: "#DCE9FF", fg: colors.text },
  optimisable: { bg: "#D3BBFF30", fg: colors.accent },
  other: { bg: colors.surfaceMuted, fg: colors.textMuted },
};

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
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [cats, setCats] = useState<CategoryAnalytics[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // La recherche part au serveur : on attend la fin de la saisie.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { from, to } = useMemo(() => {
    const [y, m] = period.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return {
      from: `${period}-01`,
      to: `${period}-${String(lastDay).padStart(2, "0")}`,
    };
  }, [period]);

  const {
    items: expenses,
    loading,
    loadingMore,
    error: listError,
    reload,
    loadMore,
  } = usePagedExpenses({ userId, from, to, q: debouncedQuery });

  const catById = useMemo(() => {
    const map = new Map<string, CategoryAnalytics>();
    for (const c of cats) map.set(c.category_id, c);
    return map;
  }, [cats]);

  const loadCats = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!userId) return;
      try {
        setCats(await analytics.categories(userId, period));
      } catch {
        if (!opts?.silent) setCats([]);
      }
    },
    [userId, period],
  );

  const onRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      await analytics.refresh(userId, period);
    } catch {
      // Rafraîchissement serveur indisponible : on repart des données actuelles.
    }
    await Promise.all([loadCats({ silent: true }), reload({ silent: true })]);
    setRefreshing(false);
  }, [userId, period, loadCats, reload]);

  useFocusEffect(
    useCallback(() => {
      void loadCats();
    }, [loadCats])
  );

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const rows = useMemo(() => {
    return expenses
      .map((e) => {
        const cat = catById.get(e.category_id);
        const name = cat?.name ?? "Divers";
        const essential = cat?.essential ?? false;
        const tag = expenseTag(cat);
        const tone = TAG_TONE[tag.kind];
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
          pill: tag.label,
          pillBg: tone.bg,
          pillColor: tone.fg,
        };
      });
  }, [expenses, catById]);

  const sections = useMemo(
    () =>
      groupByDate(rows).map((g) => ({
        key: g.date,
        title: dayLabel(g.date),
        total: g.items.reduce((s, i) => s + i.amount, 0),
        data: g.items,
      })),
    [rows]
  );

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
                  await Promise.all([loadCats({ silent: true }), reload({ silent: true })]);
                } catch {
                  Alert.alert("Suppression impossible", "Vérifiez que le serveur est démarré.");
                }
              })();
            },
          },
        ]
      );
    },
    [userId, loadCats, reload]
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

      <SectionList
        sections={sections}
        keyExtractor={(tx) => tx.id}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
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
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : listError ? (
            <EmptyState
              icon="cloud-off-outline"
              title="Chargement impossible"
              subtitle="Vérifiez la connexion puis tirez vers le bas pour réessayer."
            />
          ) : debouncedQuery.trim() ? (
            <EmptyState
              icon="text-box-search-outline"
              title="Aucun résultat"
              subtitle="Aucune dépense du mois ne correspond à cette recherche."
            />
          ) : (
            <EmptyState
              icon="text-box-remove-outline"
              title="Aucune dépense"
              subtitle="Ajoutez une dépense pour suivre vos transactions du mois."
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.primary} style={styles.footerLoader} />
          ) : (
            <View style={{ height: 24 }} />
          )
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={styles.dayLabel}>{section.title}</Text>
            <Text style={styles.dayTotal}>-{formatMoney(section.total, currency)}</Text>
          </View>
        )}
        renderItem={({ item: tx }) => (
          <Pressable
            onPress={() => openEdit(tx)}
            style={({ pressed }) => [
              styles.txCard,
              styles.txCardSpaced,
              pressed && styles.txCardPressed,
            ]}
          >
            <View style={[styles.txIcon, { backgroundColor: tx.iconBg }]}>
              <MaterialCommunityIcons color={tx.iconColor} name={tx.icon} size={22} />
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
              <Text style={styles.txAmount}>-{formatMoney(tx.amount, currency)}</Text>
              <View style={[styles.txPill, { backgroundColor: tx.pillBg }]}>
                <Text style={[styles.txPillText, { color: tx.pillColor }]}>{tx.pill}</Text>
              </View>
            </View>
            <Pressable
              onPress={() => confirmDelete(tx)}
              style={({ pressed }) => [styles.txDelete, pressed && styles.txDeletePressed]}
              hitSlop={8}
              accessibilityLabel="Supprimer la dépense"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons color={colors.textMuted} name="delete-outline" size={18} />
            </Pressable>
          </Pressable>
        )}
      />

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
    fontSize: 11,
    fontFamily: interFonts.semibold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  headerTitle: {
    color: colors.text,
    fontSize: 29,
    fontFamily: interFonts.bold,
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
  addCatText: { color: colors.primary, fontSize: 13, fontFamily: interFonts.bold },
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
    fontSize: 12,
    fontFamily: interFonts.bold,
  },

  content: { padding: 16, paddingTop: 38 },
  listHeader: { gap: 16, paddingBottom: 16 },
  footerLoader: { paddingVertical: 24 },
  loadingBox: { alignItems: "center", paddingVertical: 48 },

  /* Summary */
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontFamily: interFonts.semibold,
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
  summaryLabel: { color: colors.text, fontSize: 12, fontFamily: interFonts.medium },
  summaryValue: {
    color: colors.text,
    fontSize: 20,
    fontFamily: interFonts.semibold,
    lineHeight: 26,
  },

  /* Day groups */
  dayHeader: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 6,
  },
  dayLabel: { color: colors.textMuted, fontSize: 13, fontFamily: interFonts.semibold },
  dayTotal: { color: colors.textMuted, fontSize: 11, fontFamily: interFonts.medium },

  /* Transactions */
  txCardSpaced: { marginBottom: 10 },
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
  txTitle: { color: colors.text, fontSize: 15, fontFamily: interFonts.medium },
  txCategory: { color: colors.textMuted, fontSize: 11, fontFamily: interFonts.regular },
  txRight: { alignItems: "flex-end", gap: 4 },
  txAmount: { color: colors.text, fontSize: 15, fontFamily: interFonts.semibold },
  txPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  txPillText: { fontSize: 11, fontFamily: interFonts.semibold },

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
  navLabel: { color: colors.textMuted, fontSize: 11, fontFamily: interFonts.semibold },
  navLabelActive: { color: colors.primary },
});