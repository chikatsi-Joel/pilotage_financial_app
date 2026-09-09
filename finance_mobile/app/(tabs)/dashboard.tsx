import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router, useFocusEffect } from "expo-router";
import Svg, { Circle } from "react-native-svg";

import { colors } from "../../src/ui/theme";
import { analytics } from "../../src/shared/api/analytics";
import { useAppStore } from "../../src/shared/store";
import type {
  CategoryAnalytics,
  Dashboard,
  WeeklyExpense,
} from "../../src/shared/types";
import { formatMoney } from "../../src/shared/utils/money";

// ═══════════════════════════════════════════════════════════
//  TYPES & AIDES
// ═══════════════════════════════════════════════════════════

interface AlertItem {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  iconBg: string;
  iconColor: string;
  label: string;
  subtitle: string;
  pill: string;
  pillBg: string;
  pillColor: string;
}

const CATEGORY_ICON: Record<
  string,
  React.ComponentProps<typeof MaterialCommunityIcons>["name"]
> = {
  Restaurants: "silverware-fork-knife",
  Alimentation: "cart",
  Transport: "car",
  Shopping: "shopping",
  Logement: "home",
  Abonnements: "wifi",
  "Sorties & Loisirs": "ticket-confirmation-outline",
  "Santé": "medical-bag",
  Épargne: "piggy-bank",
};

function categoryIcon(name: string) {
  return CATEGORY_ICON[name] ?? "tag-outline";
}

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(Math.abs(value))}%`;
}

// ═══════════════════════════════════════════════════════════
//  CONSTANTES GRAPHIQUES
// ═══════════════════════════════════════════════════════════

const DONUT = {
  size: 64,
  stroke: 6,
  get radius() {
    return (this.size - this.stroke) / 2;
  },
  get circumference() {
    return 2 * Math.PI * this.radius;
  },
};

// ═══════════════════════════════════════════════════════════
//  SOUS-COMPOSANTS
// ═══════════════════════════════════════════════════════════

function DonutProgress({ pct }: { pct: number }) {
  const dash = pct * DONUT.circumference;

  return (
    <View style={donutStyles.wrap}>
      <Svg height={DONUT.size} width={DONUT.size}>
        <Circle
          cx={DONUT.size / 2}
          cy={DONUT.size / 2}
          fill="none"
          r={DONUT.radius}
          stroke="#D3BBFF"
          strokeWidth={DONUT.stroke}
        />
        <Circle
          cx={DONUT.size / 2}
          cy={DONUT.size / 2}
          fill="none"
          origin={`${DONUT.size / 2}, ${DONUT.size / 2}`}
          r={DONUT.radius}
          rotation={-90}
          stroke={colors.accent}
          strokeDasharray={`${dash}, ${DONUT.circumference}`}
          strokeLinecap="round"
          strokeWidth={DONUT.stroke}
        />
      </Svg>
      <View style={donutStyles.center}>
        <Text style={donutStyles.pct}>{Math.round(pct * 100)}%</Text>
      </View>
    </View>
  );
}

const donutStyles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    height: DONUT.size,
    justifyContent: "center",
    width: DONUT.size,
  },
  center: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  pct: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
  },
});

// ─────────────────────────────────────────────────────────

function Sparkline({ data }: { data: number[] }) {
  const values = data.length ? data : [0];
  const max = Math.max(...values, 1);

  return (
    <View style={sparkStyles.container}>
      <View style={sparkStyles.track}>
        {values.map((h, i) => {
          const isLast = i === values.length - 1;
          const heightPct = (h / max) * 100;

          return (
            <View key={i} style={sparkStyles.barWrap}>
              <View
                style={[
                  sparkStyles.bar,
                  { height: `${heightPct}%` },
                  isLast && sparkStyles.barLast,
                ]}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const sparkStyles = StyleSheet.create({
  container: {
    height: 48,
    marginTop: 8,
  },
  track: {
    alignItems: "flex-end",
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  barWrap: {
    alignItems: "center",
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
  },
  bar: {
    backgroundColor: `${colors.primary}30`,
    borderRadius: 2,
    width: 4,
  },
  barLast: {
    backgroundColor: "#FFFFFF",
    borderColor: colors.primary,
    borderRadius: 4,
    borderWidth: 2,
    height: 8,
    marginBottom: 2,
    width: 8,
  },
});

// ─────────────────────────────────────────────────────────

function AlertCard({ alert }: { alert: AlertItem }) {
  return (
    <View style={alertStyles.card}>
      <View style={alertStyles.top}>
        <View style={[alertStyles.icon, { backgroundColor: alert.iconBg }]}>
          <MaterialCommunityIcons
            color={alert.iconColor}
            name={alert.icon}
            size={18}
          />
        </View>
        <View style={[alertStyles.pill, { backgroundColor: alert.pillBg }]}>
          <Text style={[alertStyles.pillText, { color: alert.pillColor }]}>
            {alert.pill}
          </Text>
        </View>
      </View>
      <Text style={alertStyles.label}>{alert.label}</Text>
      <Text style={alertStyles.subtitle}>{alert.subtitle}</Text>
    </View>
  );
}

const alertStyles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DCE9FF",
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    width: 150,
  },
  top: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  icon: {
    alignItems: "center",
    borderRadius: 99,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  pill: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 12, fontWeight: "600" },
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "500",
    marginTop: 4,
  },
  subtitle: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
});

// ─────────────────────────────────────────────────────────

function BudgetBarChart({ weekly }: { weekly: WeeklyExpense[] }) {
  const maxVal = Math.max(
    1,
    ...weekly.map((w) => Math.max(w.prevu, w.reel))
  );
  const heightOf = (value: number) =>
    Math.max((value / maxVal) * 100, 2);

  return (
    <View style={chartStyles.card}>
      <View style={chartStyles.area}>
        <View style={[chartStyles.yLine, { top: 0 }]} />
        <View style={[chartStyles.yLine, { top: "33%" }]} />
        <View style={[chartStyles.yLine, { top: "66%" }]} />
        <View style={[chartStyles.yLineSolid, { bottom: 0 }]} />

        <View style={chartStyles.barsRow}>
          {weekly.map((w) => (
            <View key={w.label} style={chartStyles.barGroup}>
              <View style={chartStyles.barPair}>
                <View
                  style={[
                    chartStyles.bar,
                    {
                      height: `${heightOf(w.prevu)}%`,
                      backgroundColor: "#C7C5D1",
                    },
                  ]}
                />
                <View
                  style={[
                    chartStyles.bar,
                    {
                      height: `${heightOf(w.reel)}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>
              <Text style={chartStyles.barLabel}>{w.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={chartStyles.legend}>
        <LegendItem color="#C7C5D1" label="Prévu" />
        <LegendItem color={colors.primary} label="Réel" />
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={legendStyles.item}>
      <View style={[legendStyles.dot, { backgroundColor: color }]} />
      <Text style={legendStyles.text}>{label}</Text>
    </View>
  );
}

const legendStyles = StyleSheet.create({
  item: { alignItems: "center", flexDirection: "row", gap: 6 },
  dot: { borderRadius: 99, height: 12, width: 12 },
  text: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
});

const chartStyles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DCE9FF",
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
  },
  area: {
    height: 192,
    paddingBottom: 24,
    paddingTop: 32,
    position: "relative",
  },
  yLine: {
    borderColor: "#C8C4D550",
    borderStyle: "dashed",
    borderWidth: 1,
    left: 0,
    position: "absolute",
    right: 0,
  },
  yLineSolid: {
    borderColor: "#C8C4D580",
    borderWidth: 1,
    left: 0,
    position: "absolute",
    right: 0,
  },
  barsRow: {
    alignItems: "flex-end",
    bottom: 24,
    flexDirection: "row",
    flex: 1,
    justifyContent: "space-around",
    left: 8,
    position: "absolute",
    right: 8,
    top: 32,
  },
  barGroup: {
    alignItems: "center",
    flex: 1,
    gap: 8,
    height: "100%",
    justifyContent: "flex-end",
  },
  barPair: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 4,
    height: "100%",
  },
  bar: { borderRadius: 4, width: 12 },
  barLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  legend: {
    borderTopColor: "#DCE9FF",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 24,
    justifyContent: "center",
    marginTop: 12,
    paddingTop: 12,
  },
});

// ═══════════════════════════════════════════════════════════
//  COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════

export default function Dashboard() {
  const userId = useAppStore((s) => s.userId);
  const currency = useAppStore((s) => s.currency);
  const period = useAppStore((s) => s.currentPeriod);

  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!userId) throw new Error("no-session");
      const result = await analytics.dashboard(userId, period);
      setData(result);
    } catch {
      setData(null);
      setError(
        userId
          ? "Serveur injoignable. Vérifiez que le backend est démarré."
          : "Session non initialisée. Passez par l'onboarding."
      );
    } finally {
      setLoading(false);
    }
  }, [userId, period]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const solde = data ? data.income - data.expenses : 0;

  const alerts: AlertItem[] =
    data?.top_drift_categories.slice(0, 4).map(
      (c: CategoryAnalytics): AlertItem => ({
        icon: categoryIcon(c.name),
        iconBg: c.essential ? "#D3E4FE" : "#FFDAD6",
        iconColor: c.essential ? "#474552" : "#93000A",
        label: c.name,
        subtitle: "À surveiller",
        pill: formatPct(c.variation_percentage),
        pillBg: "#EBDCFF",
        pillColor: "#260059",
      })
    ) ?? [];

  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const projectedDate = `${lastDay} ${MONTHS_FR[month - 1]} ${year}`;

  const goal = data?.savings_goal ?? null;
  const trackMax = Math.max(goal?.target_amount ?? 0, solde, 1);

  if (loading && !data) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error && !data) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.centered}>
          <MaterialCommunityIcons
            color={colors.textMuted}
            name="cloud-off-outline"
            size={40}
          />
          <Text style={styles.errorTitle}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Tableau de bord</Text>
          <View style={styles.headerActions}>
            <Link href="/add-expense" asChild>
              <Pressable
                style={styles.quickAdd}
                hitSlop={8}
                accessibilityLabel="Ajouter une dépense"
                accessibilityRole="button"
                accessibilityHint="Ouvre le formulaire de saisie d'une dépense"
              >
                <MaterialCommunityIcons name="plus" size={15} color={colors.primary} />
                <Text style={styles.quickAddText}>Ajouter</Text>
              </Pressable>
            </Link>
            <View style={styles.avatar}>
              <MaterialCommunityIcons
                color="#FFFFFF"
                name="account"
                size={18}
              />
            </View>
          </View>
        </View>

        {/* ── Solde Restant ── */}
        <View style={styles.soldeCard}>
          <View style={styles.soldeDecorTop} />
          <View style={styles.soldeDecorBottom} />
          <Text style={styles.soldeLabel}>Solde Restant</Text>
          <Text style={styles.soldeAmount}>
            {formatMoney(solde, currency)}
          </Text>
          <Sparkline data={data?.sparkline ?? []} />
          {data?.monthly_variation != null && (
            <Pressable
              style={styles.soldeTrend}
              hitSlop={12}
              onPress={() => router.push("/stats-detail")}
            >
              <MaterialCommunityIcons
                color={colors.accent}
                name={
                  data.monthly_variation >= 0
                    ? "trending-up"
                    : "trending-down"
                }
                size={16}
              />
              <Text style={styles.soldeTrendText}>
                {formatPct(data.monthly_variation)} vs mois dernier
              </Text>
            </Pressable>
          )}
        </View>

        {/* ── Vigilance Budgétaire ── */}
        {alerts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Vigilance Budgétaire</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.alertsScroll}
            >
              {alerts.map((alert) => (
                <AlertCard key={alert.label} alert={alert} />
              ))}
            </ScrollView>
          </>
        )}

        {/* ── Réel vs Prévu ── */}
        <View style={styles.chartHeader}>
          <Text style={styles.sectionTitle}>Réel vs Prévu</Text>
          <Link href="/analyse" asChild>
            <Pressable style={styles.chartFilter}>
              <Text style={styles.chartFilterText}>Ce mois</Text>
            </Pressable>
          </Link>
        </View>
        <BudgetBarChart weekly={data?.weekly ?? []} />

        {/* ── Épargne Projetée ── */}
        <View style={styles.projectedCard}>
          <View style={styles.projectedDecor} />
          <View style={styles.projectedTop}>
            <Text style={styles.projectedLabel}>Épargne Projetée</Text>
            <Text style={styles.projectedDate}>{projectedDate}</Text>
          </View>
          <Text style={styles.projectedAmount}>
            {formatMoney(data?.savings ?? 0, currency)}
          </Text>
          {data?.monthly_variation != null && (
            <View style={styles.projectedCompare}>
              <Text style={styles.projectedCompareLabel}>
                vs mois dernier
              </Text>
              <View style={styles.projectedDelta}>
                <MaterialCommunityIcons
                  color="#FFFFFF"
                  name={
                    data.monthly_variation >= 0
                      ? "arrow-top-right"
                      : "arrow-bottom-right"
                  }
                  size={14}
                />
                <Text style={styles.projectedDeltaText}>
                  {formatPct(data.monthly_variation)}
                </Text>
              </View>
            </View>
          )}
          <View style={styles.projectedBarRow}>
            <Text style={styles.projectedBarMarker}>
              {formatMoney(0, currency)}
            </Text>
            <View style={styles.projectedBarTrack}>
              <View
                style={[
                  styles.projectedBarFill,
                  {
                    width: `${Math.min(
                      (solde / trackMax) * 100,
                      100
                    )}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.projectedBarMarker}>
              {formatMoney(trackMax, currency)}
            </Text>
          </View>
        </View>

        {/* ── Épargne Réalisée ── */}
        {goal && (
          <View style={styles.savingsCard}>
            <View style={styles.savingsDecorTop} />
            <View style={styles.savingsDecorBottom} />
            <View style={styles.savingsContent}>
              <View style={styles.savingsLeft}>
                <Text style={styles.savingsLabel}>Épargne Réalisée</Text>
                <Text style={styles.savingsAmount}>
                  {formatMoney(goal.current_amount, currency)}
                </Text>
                <Text style={styles.savingsGoal}>
                  Objectif : {formatMoney(goal.target_amount, currency)}
                </Text>
              </View>
              <DonutProgress pct={goal.progress_percentage} />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scrollContent: { gap: 20, padding: 16 },

  centered: {
    alignItems: "center",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 99,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },

  /* Header */
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: "600" },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 10 },
  quickAdd: {
    alignItems: "center",
    backgroundColor: "#E4DFFF30",
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  quickAddText: { color: colors.primary, fontSize: 14, fontWeight: "500" },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },

  /* Solde Restant */
  soldeCard: {
    backgroundColor: "#E5EEFF",
    borderRadius: 24,
    gap: 4,
    padding: 24,
    position: "relative",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
  },
  soldeDecorTop: {
    backgroundColor: `${colors.primary}18`,
    borderRadius: 999,
    height: 220,
    position: "absolute",
    right: -70,
    top: -70,
    width: 220,
  },
  soldeDecorBottom: {
    backgroundColor: "#865DD215",
    borderRadius: 999,
    height: 160,
    position: "absolute",
    bottom: -40,
    left: -40,
    width: 160,
  },
  soldeLabel: {
    color: "#474552",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  soldeAmount: {
    color: colors.primary,
    fontSize: 48,
    fontWeight: "700",
    letterSpacing: -2,
    lineHeight: 56,
  },
  soldeTrend: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 4,
  },
  soldeTrendText: { color: colors.accent, fontSize: 12, fontWeight: "600" },

  /* Vigilance */
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 28,
  },
  alertsScroll: { gap: 12 },

  /* Réel vs Prévu */
  chartHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  chartFilter: {
    backgroundColor: "#E4DFFF30",
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chartFilterText: { color: colors.primary, fontSize: 14, fontWeight: "500" },

  /* ═══ Épargne Projetée ═══ */
  projectedCard: {
    backgroundColor: "#E0E7FF",
    borderRadius: 24,
    gap: 10,
    overflow: "hidden",
    padding: 24,
    position: "relative",
  },
  projectedDecor: {
    backgroundColor: `${colors.primary}10`,
    borderRadius: 999,
    height: 180,
    position: "absolute",
    right: -60,
    top: -60,
    width: 180,
  },
  projectedTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  projectedLabel: {
    color: "#474552",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  projectedDate: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  projectedAmount: {
    color: colors.primary,
    fontSize: 48,
    fontWeight: "700",
    letterSpacing: -2,
    lineHeight: 56,
  },
  projectedCompare: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  projectedCompareLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
  projectedDelta: {
    alignItems: "center",
    backgroundColor: colors.success,
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  projectedDeltaText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  projectedBarRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  projectedBarTrack: {
    backgroundColor: `${colors.primary}20`,
    borderRadius: 99,
    flex: 1,
    height: 8,
    overflow: "hidden",
  },
  projectedBarFill: {
    backgroundColor: colors.primary,
    borderRadius: 99,
    height: 8,
  },
  projectedBarMarker: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "500",
    minWidth: 28,
  },

  /* ═══ Épargne Réalisée ═══ */
  savingsCard: {
    backgroundColor: "#EBDCFF",
    borderRadius: 24,
    overflow: "hidden",
    padding: 20,
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  savingsDecorTop: {
    backgroundColor: "#FFFFFF26",
    borderRadius: 999,
    height: 160,
    position: "absolute",
    right: -48,
    top: -48,
    width: 160,
  },
  savingsDecorBottom: {
    backgroundColor: "#572BA015",
    borderRadius: 999,
    height: 96,
    position: "absolute",
    bottom: -32,
    left: -24,
    width: 96,
  },
  savingsContent: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  savingsLeft: { flex: 1, gap: 2 },
  savingsLabel: {
    color: "#260059",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  savingsAmount: {
    color: "#260059",
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 32,
  },
  savingsGoal: {
    color: "#572BA0",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
});