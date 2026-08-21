import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import Svg, { Circle } from "react-native-svg";

import { colors } from "../../src/ui/theme";

// ═══════════════════════════════════════════════════════════
//  TYPES & DONNÉES
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

const ALERTS: AlertItem[] = [
  {
    icon: "silverware-fork-knife",
    iconBg: "#FFDAD6",
    iconColor: "#93000A",
    label: "Restaurants",
    subtitle: "Budget dépassé",
    pill: "+58%",
    pillBg: "#EBDCFF",
    pillColor: "#260059",
  },
  {
    icon: "car",
    iconBg: "#D3E4FE",
    iconColor: "#474552",
    label: "Transport",
    subtitle: "À surveiller",
    pill: "+15%",
    pillBg: "#D3BBFF",
    pillColor: "#260059",
  },
  {
    icon: "shopping",
    iconBg: "#FFDAD6",
    iconColor: "#93000A",
    label: "Shopping",
    subtitle: "Habitude en hausse",
    pill: "+22%",
    pillBg: "#EBDCFF",
    pillColor: "#260059",
  },
  {
    icon: "wifi",
    iconBg: "#D3E4FE",
    iconColor: "#474552",
    label: "Abonnements",
    subtitle: "Inutilisés",
    pill: "3 actifs",
    pillBg: "#EBDCFF",
    pillColor: "#260059",
  },
];

interface WeekData {
  label: string;
  prevu: number;
  reel: number;
}

const WEEKS: WeekData[] = [
  { label: "S1", prevu: 60, reel: 45 },
  { label: "S2", prevu: 80, reel: 90 },
  { label: "S3", prevu: 50, reel: 30 },
  { label: "S4", prevu: 70, reel: 20 },
];

const SPARKLINE_DATA = [30, 35, 25, 20, 10, 15, 5];

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
    ...StyleSheet.absoluteFillObject,
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

function Sparkline() {
  const max = Math.max(...SPARKLINE_DATA);

  return (
    <View style={sparkStyles.container}>
      <View style={sparkStyles.track}>
        {SPARKLINE_DATA.map((h, i) => {
          const isLast = i === SPARKLINE_DATA.length - 1;
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

function BudgetBarChart() {
  return (
    <View style={chartStyles.card}>
      <View style={chartStyles.area}>
        <View style={[chartStyles.yLine, { top: 0 }]} />
        <View style={[chartStyles.yLine, { top: "33%" }]} />
        <View style={[chartStyles.yLine, { top: "66%" }]} />
        <View style={[chartStyles.yLineSolid, { bottom: 0 }]} />

        <View style={chartStyles.barsRow}>
          {WEEKS.map((w) => (
            <View key={w.label} style={chartStyles.barGroup}>
              <View style={chartStyles.barPair}>
                <View
                  style={[
                    chartStyles.bar,
                    {
                      height: `${w.prevu}%`,
                      backgroundColor: "#C7C5D1",
                    },
                  ]}
                />
                <View
                  style={[
                    chartStyles.bar,
                    {
                      height: `${w.reel}%`,
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
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Tableau de bord</Text>
          <View style={styles.avatar}>
            <MaterialCommunityIcons
              color="#FFFFFF"
              name="account"
              size={18}
            />
          </View>
        </View>

        {/* ── Solde Restant ── */}
        <View style={styles.soldeCard}>
          <View style={styles.soldeDecorTop} />
          <View style={styles.soldeDecorBottom} />
          <Text style={styles.soldeLabel}>Solde Restant</Text>
          <Text style={styles.soldeAmount}>2 450,00 €</Text>
          <Sparkline />
          <View style={styles.soldeTrend}>
            <MaterialCommunityIcons
              color={colors.accent}
              name="trending-up"
              size={16}
            />
            <Text style={styles.soldeTrendText}>+12% vs mois dernier</Text>
          </View>
        </View>

        {/* ── Vigilance Budgétaire ── */}
        <Text style={styles.sectionTitle}>Vigilance Budgétaire</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.alertsScroll}
        >
          {ALERTS.map((alert) => (
            <AlertCard key={alert.label} alert={alert} />
          ))}
        </ScrollView>

        {/* ── Réel vs Prévu ── */}
        <View style={styles.chartHeader}>
          <Text style={styles.sectionTitle}>Réel vs Prévu</Text>
          <Link href="/depenses" asChild>
            <Pressable style={styles.chartFilter}>
              <Text style={styles.chartFilterText}>Ce mois</Text>
            </Pressable>
          </Link>
        </View>
        <BudgetBarChart />

        {/* ── Épargne Projetée ── */}
        <View style={styles.projectedCard}>
          <View style={styles.projectedDecor} />
          <View style={styles.projectedTop}>
            <Text style={styles.projectedLabel}>Épargne Projetée</Text>
            <Text style={styles.projectedDate}>31 août 2026</Text>
          </View>
          <Text style={styles.projectedAmount}>3 120 €</Text>
          <View style={styles.projectedCompare}>
            <Text style={styles.projectedCompareLabel}>vs mois dernier</Text>
            <Text style={styles.projectedCompareValue}>2 890 €</Text>
            <View style={styles.projectedDelta}>
              <MaterialCommunityIcons
                color="#FFFFFF"
                name="arrow-top-right"
                size={14}
              />
              <Text style={styles.projectedDeltaText}>+230 € (+8%)</Text>
            </View>
          </View>
          <View style={styles.projectedBarRow}>
            <Text style={styles.projectedBarMarker}>0 €</Text>
            <View style={styles.projectedBarTrack}>
              <View style={[styles.projectedBarFill, { width: "78%" }]} />
            </View>
            <Text style={styles.projectedBarMarker}>4 000 €</Text>
          </View>
        </View>

        {/* ── Épargne Réalisée ── */}
        <View style={styles.savingsCard}>
          <View style={styles.savingsDecorTop} />
          <View style={styles.savingsDecorBottom} />
          <View style={styles.savingsContent}>
            <View style={styles.savingsLeft}>
              <Text style={styles.savingsLabel}>Épargne Réalisée</Text>
              <Text style={styles.savingsAmount}>450,00 €</Text>
              <Text style={styles.savingsGoal}>Objectif : 500 €</Text>
            </View>
            <DonutProgress pct={0.9} />
          </View>
        </View>

        <View style={{ height: 100 }} />
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

  /* Header */
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: "600" },
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
    overflow: "hidden",
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
    backgroundColor: "#E0E7FF", // indigo très pâle — distinct du Solde (#E5EEFF)
    borderRadius: 24,
    gap: 10,
    overflow: "hidden",
    padding: 24,
    position: "relative", // ← CRUCIAL pour caler le décor
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
    fontSize: 48, // ← harmonisé avec le Solde
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
  projectedCompareValue: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    // ← plus de line-through ici
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
    marginTop: 14, // ← plus d'air
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

  /* FAB */
  fab: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 99,
    bottom: 24,
    elevation: 6,
    height: 56,
    justifyContent: "center",
    position: "absolute",
    right: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    width: 56,
  },
});