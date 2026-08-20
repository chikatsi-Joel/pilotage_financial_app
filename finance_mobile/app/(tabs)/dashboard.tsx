import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";

import { colors } from "../../src/ui/theme";

const ALERTS = [
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
] as const;

const WEEKS = [
  { label: "S1", prevu: 60, reel: 45 },
  { label: "S2", prevu: 80, reel: 90 },
  { label: "S3", prevu: 50, reel: 30 },
  { label: "S4", prevu: 70, reel: 20 },
] as const;

const donutSize = 64;
const donutTrack = 3;
const donutHalf = donutSize / 2;

function DonutProgress({ pct }: { pct: number }) {
  const rightVisible = pct <= 0.5;
  const leftDeg = rightVisible ? 0 : Math.round((pct - 0.5) * 360);
  const rightDeg = rightVisible ? Math.round(pct * 360) : 180;

  return (
    <View style={donut.wrap}>
      <View style={donut.track}>
        <View style={donut.rightClip}>
          <View
            style={[
              donut.semiFill,
              { transform: [{ rotate: `${rightDeg}deg` }] },
            ]}
          />
        </View>
        <View style={donut.leftClip}>
          <View
            style={[
              donut.semiFill,
              { transform: [{ rotate: `${leftDeg}deg` }] },
            ]}
          />
        </View>
      </View>
      <View style={donut.center}>
        <Text style={donut.pct}>{Math.round(pct * 100)}%</Text>
      </View>
    </View>
  );
}

const donut = StyleSheet.create({
  wrap: { height: donutSize, width: donutSize },
  track: {
    backgroundColor: "#D3BBFF",
    borderRadius: 999,
    height: donutSize,
    overflow: "hidden",
    width: donutSize,
  },
  rightClip: {
    height: donutHalf,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0,
    width: donutSize,
  },
  leftClip: {
    bottom: 0,
    height: donutHalf,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    width: donutSize,
  },
  semiFill: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    height: donutSize,
    position: "absolute",
    top: donutHalf,
    width: donutSize,
  },
  center: {
    alignItems: "center",
    backgroundColor: "#EBDCFF",
    borderRadius: 999,
    height: donutSize - donutTrack * 2,
    justifyContent: "center",
    position: "absolute",
    top: donutTrack,
    width: donutSize - donutTrack * 2,
  },
  pct: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
  },
});

export default function Dashboard() {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Tableau De Bord</Text>
          <View style={styles.avatar}>
            <MaterialCommunityIcons color="#FFFFFF" name="account" size={18} />
          </View>
        </View>

        {/* ── Solde Restant ── */}
        <View style={styles.soldeCard}>
          <View style={styles.soldeDecorTop} />
          <View style={styles.soldeDecorBottom} />
          <Text style={styles.soldeLabel}>Solde Restant</Text>
          <Text style={styles.soldeAmount}>2 450,00 €</Text>
          <View style={styles.sparkline}>
            <View style={styles.sparkArea}>
              {[30, 35, 25, 20, 10, 15, 5].map((h, i) => (
                <View key={i} style={[styles.sparkDot, { height: h, bottom: h }]} />
              ))}
              <View style={styles.sparkDotLast} />
            </View>
          </View>
          <View style={styles.soldeTrend}>
            <MaterialCommunityIcons color={colors.accent} name="trending-up" size={16} />
            <Text style={styles.soldeTrendText}>+12% vs mois dernier</Text>
          </View>
        </View>

        {/* ── Vigilance Budgétaire ── */}
        <Text style={styles.sectionTitle}>Vigilance Budgétaire</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.alertsScroll}>
          {ALERTS.map((a) => (
            <View key={a.label} style={styles.alertCard}>
              <View style={styles.alertTop}>
                <View style={[styles.alertIcon, { backgroundColor: a.iconBg }]}>
                  <MaterialCommunityIcons color={a.iconColor} name={a.icon as any} size={18} />
                </View>
                <View style={[styles.alertPill, { backgroundColor: a.pillBg }]}>
                  <Text style={[styles.alertPillText, { color: a.pillColor }]}>{a.pill}</Text>
                </View>
              </View>
              <Text style={styles.alertLabel}>{a.label}</Text>
              <Text style={styles.alertSubtitle}>{a.subtitle}</Text>
            </View>
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
        <View style={styles.chartCard}>
          <View style={styles.chartArea}>
            <View style={[styles.yLine, { top: 0 }]} />
            <View style={[styles.yLine, { top: "33%" }]} />
            <View style={[styles.yLine, { top: "66%" }]} />
            <View style={[styles.yLineSolid, { bottom: 0 }]} />
            <View style={styles.barsRow}>
              {WEEKS.map((w) => (
                <View key={w.label} style={styles.barGroup}>
                  <View style={styles.barPair}>
                    <View style={[styles.bar, { height: `${w.prevu}%`, backgroundColor: "#C7C5D1" }]} />
                    <View style={[styles.bar, { height: `${w.reel}%`, backgroundColor: colors.primary }]} />
                  </View>
                  <Text style={styles.barLabel}>{w.label}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.chartLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#C7C5D1" }]} />
              <Text style={styles.legendText}>Prévu</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.legendText}>Réel</Text>
            </View>
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
              <Text style={styles.savingsGoal}>Objectif: 500€</Text>
            </View>
            <DonutProgress pct={0.9} />
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── FAB ── */}
      <Pressable style={styles.fab}>
        <MaterialCommunityIcons color="#FFFFFF" name="plus" size={28} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { gap: 20, padding: 16 },

  /* Header */
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  headerTitle: { fontSize: 20, fontWeight: "600", color: colors.text },
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
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
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
  sparkline: { height: 48, marginTop: 8, overflow: "hidden" },
  sparkArea: {
    flexDirection: "row",
    alignItems: "flex-end",
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  sparkDot: {
    width: 4,
    backgroundColor: `${colors.primary}30`,
    borderRadius: 2,
    position: "absolute",
  },
  sparkDotLast: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    borderColor: colors.primary,
    borderWidth: 2,
    position: "absolute",
    right: 0,
    bottom: 5,
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
  alertCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DCE9FF",
    gap: 8,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    width: 150,
  },
  alertTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  alertIcon: {
    alignItems: "center",
    borderRadius: 99,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  alertPill: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  alertPillText: { fontSize: 12, fontWeight: "600" },
  alertLabel: { color: colors.text, fontSize: 16, fontWeight: "500", marginTop: 4 },
  alertSubtitle: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },

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
  chartCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#DCE9FF",
    overflow: "hidden",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
  },
  chartArea: { height: 192, position: "relative", paddingTop: 32, paddingBottom: 24 },
  yLine: {
    borderColor: "#C8C4D550",
    borderStyle: "dashed",
    borderWidth: 1,
    position: "absolute",
    left: 0,
    right: 0,
  },
  yLineSolid: {
    borderColor: "#C8C4D580",
    borderWidth: 1,
    position: "absolute",
    left: 0,
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
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    height: "100%",
  },
  bar: { borderRadius: 4, width: 12 },
  barLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  chartLegend: {
    borderTopColor: "#DCE9FF",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 24,
    justifyContent: "center",
    marginTop: 12,
    paddingTop: 12,
  },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 6 },
  legendDot: { borderRadius: 99, height: 12, width: 12 },
  legendText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },

  /* Épargne Réalisée */
  savingsCard: {
    backgroundColor: "#EBDCFF",
    borderRadius: 24,
    overflow: "hidden",
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  savingsDecorTop: {
    backgroundColor: "#FFFFFF26",
    borderRadius: 99,
    height: 160,
    position: "absolute",
    right: -48,
    top: -48,
    width: 160,
  },
  savingsDecorBottom: {
    backgroundColor: "#572BA015",
    borderRadius: 99,
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
  savingsAmount: { color: "#260059", fontSize: 24, fontWeight: "600", lineHeight: 32 },
  savingsGoal: { color: "#572BA0", fontSize: 12, fontWeight: "600", marginTop: 4 },

  /* FAB */
  fab: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 99,
    bottom: 80,
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
