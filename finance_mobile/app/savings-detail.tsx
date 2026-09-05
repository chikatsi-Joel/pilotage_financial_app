import React, { useMemo, useRef } from "react";
import {
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import { colors } from "../src/ui/theme";

/* ------------------------------------------------------------------ */
//  Helpers
/* ------------------------------------------------------------------ */

const eur = (n: number) => `${new Intl.NumberFormat("fr-FR").format(n)} €`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const monthLabel = (iso: string) =>
  cap(new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));

/* ------------------------------------------------------------------ */
//  Données mockées (à remplacer par ton API)
/* ------------------------------------------------------------------ */

type Contribution = { id: string; amount: number; created_at: string };

const MOCK = {
  goal: {
    name: "Achat Appartement",
    icon: "apartment",
    current: 18500,
    target: 40000,
    deadline: "2026-05-31",
  },
  analysis: {
    trendLabel: "↗ En hausse",
    trendSub: "Versements réguliers",
    accelerationMonths: 4,
    gainPerMonth: 125,
    rationale:
      "Vos versements sont réguliers et en hausse. En optimisant vos abonnements et en plaçant sur un Livret A, vous pourriez atteindre votre objectif 4 mois plus tôt.",
  },
  contributions: [
    { id: "c1", amount: 2500, created_at: "2025-01-15T10:30:00" },
    { id: "c2", amount: 2000, created_at: "2025-02-10T14:00:00" },
    { id: "c3", amount: 3000, created_at: "2025-03-05T09:15:00" },
    { id: "c4", amount: 1500, created_at: "2025-03-20T18:45:00" },
    { id: "c5", amount: 2500, created_at: "2025-04-12T11:00:00" },
    { id: "c6", amount: 1500, created_at: "2025-04-28T08:30:00" },
    { id: "c7", amount: 2000, created_at: "2025-05-15T16:20:00" },
    { id: "c8", amount: 1500, created_at: "2025-06-02T12:10:00" },
    { id: "c9", amount: 2000, created_at: "2025-06-18T15:40:00" },
  ] satisfies Contribution[],
} as const;

/* ------------------------------------------------------------------ */
//  Animation d'entrée
/* ------------------------------------------------------------------ */

const FadeIn = ({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: any;
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 500,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
};

/* ------------------------------------------------------------------ */
//  Graphique SVG
/* ------------------------------------------------------------------ */

const TrajectoryChart = () => {
  const pathOpacity = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(pathOpacity, {
      toValue: 1,
      duration: 1200,
      delay: 400,
      useNativeDriver: true,
    }).start();
  }, [pathOpacity]);

  return (
    <View style={styles.chartBox}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>Trajectoire & Projection</Text>
        <View style={styles.chartLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.legendText}>Optimisé</Text>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.textMuted, borderStyle: "dashed" },
              ]}
            />
            <Text style={styles.legendText}>Actuel</Text>
          </View>
        </View>
      </View>

      <Animated.View style={{ opacity: pathOpacity, height: 160 }}>
        <Svg viewBox="0 0 300 120" width="100%" height="100%">
          <Defs>
            <LinearGradient id="optFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.25} />
              <Stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {/* Grid */}
          <Line x1="0" y1="30" x2="300" y2="30" stroke="#C8C4D550" strokeDasharray="2" strokeWidth="0.5" />
          <Line x1="0" y1="60" x2="300" y2="60" stroke="#C8C4D550" strokeDasharray="2" strokeWidth="0.5" />
          <Line x1="0" y1="90" x2="300" y2="90" stroke="#C8C4D550" strokeDasharray="2" strokeWidth="0.5" />

          {/* Cible */}
          <Line x1="0" y1="12" x2="300" y2="12" stroke={colors.textMuted} strokeDasharray="4 4" strokeWidth="1.5" />
          <SvgText x="4" y="24" fill={colors.textMuted} fontSize="9">
            Cible 40k
          </SvgText>

          {/* Trajectoire actuelle (trait plein, en dessous) */}
          <Path d="M0 100 Q 60 88, 120 72 T 220 48 T 300 32" fill="none" stroke="#C7C5D1" strokeWidth="2.5" strokeDasharray="6 4" />

          {/* Trajectoire optimisée (remplissage) */}
          <Path d="M0 100 Q 60 88, 120 72 T 220 30 T 300 8 L 300 120 L 0 120 Z" fill="url(#optFill)" />

          {/* Trajectoire optimisée (ligne) */}
          <Path d="M0 100 Q 60 88, 120 72 T 220 30 T 300 8" fill="none" stroke={colors.primary} strokeWidth="2.5" />
          <Circle cx="300" cy="8" r="4" fill={colors.primary} stroke="#FFFFFF" strokeWidth="2" />
          <Circle cx="300" cy="32" r="3" fill="#C7C5D1" />
        </Svg>
      </Animated.View>

      <View style={styles.chartXAxis}>
        <Text style={styles.chartXLabel}>Auj.</Text>
        <Text style={styles.chartXLabel}>S2 25</Text>
        <Text style={styles.chartXLabel}>S1 26</Text>
        <Text style={styles.chartXLabel}>S2 26</Text>
      </View>
    </View>
  );
};

/* ------------------------------------------------------------------ */
//  Page principale
/* ------------------------------------------------------------------ */

export default function SavingsDetail() {
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  const goal = MOCK.goal;
  const contributions = MOCK.contributions;

  const pct = Math.round((goal.current / goal.target) * 100);
  const remainder = goal.target - goal.current;
  const deadlineLabel = monthLabel(goal.deadline);
  const contributionCount = contributions.length;

  const monthGroups = useMemo(() => {
    const map = new Map<string, { month: string; items: typeof contributions }>();
    for (const c of contributions) {
      const key = c.created_at.slice(0, 7);
      const existing = map.get(key);
      if (existing) {
        existing.items = [...existing.items, c];
      } else {
        map.set(key, { month: monthLabel(`${key}-01`), items: [c] });
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([, g]) => g);
  }, [contributions]);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* ── Header ── */}
        <FadeIn delay={0}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              accessibilityLabel="Retour"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
            </Pressable>
            <View style={styles.headerMeta}>
              <View style={styles.headerCategoryRow}>
                <MaterialCommunityIcons name={goal.icon as any} size={16} color={colors.primary} />
                <Text style={[styles.headerCategory, { color: colors.primary }]}>Objectif d'épargne</Text>
              </View>
              <Text style={styles.headerAmount}>
                {new Intl.NumberFormat("fr-FR").format(goal.current)}{" "}
                <Text style={styles.headerCurrency}>€</Text>
              </Text>
              <View style={[styles.trendBadge, { backgroundColor: `${colors.success}12` }]}>
                <MaterialCommunityIcons name="arrow-up" size={14} color={colors.success} />
                <Text style={[styles.trendText, { color: colors.success }]}>{pct}% atteint</Text>
              </View>
            </View>
            <View style={{ width: 24 }} />
          </View>
        </FadeIn>

        {/* ── Dynamique des versements ── */}
        <FadeIn delay={100}>
          <View style={styles.alertCard}>
            <View style={[styles.alertIcon, { backgroundColor: `${colors.primary}12` }]}>
              <MaterialCommunityIcons name="piggy-bank" size={18} color={colors.primary} />
            </View>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>Bonne dynamique</Text>
              <Text style={styles.alertDesc}>
                Versements réguliers et en hausse chaque mois depuis janvier 2025.
              </Text>
            </View>
          </View>
        </FadeIn>

        {/* ── Grille 2 cols ── */}
        <FadeIn delay={200}>
          <View style={styles.grid}>
            <View style={styles.gridCard}>
              <View style={styles.gridHeader}>
                <MaterialCommunityIcons name="flag-checkered" size={14} color={colors.textMuted} />
                <Text style={styles.gridLabel}>Cible</Text>
              </View>
              <Text style={styles.gridValue}>{eur(goal.target)}</Text>
              <Text style={styles.gridSub}>Avant {deadlineLabel}</Text>
            </View>

            <View style={styles.gridCard}>
              <View style={styles.gridHeader}>
                <MaterialCommunityIcons name="bank-transfer-in" size={14} color={colors.textMuted} />
                <Text style={styles.gridLabel}>Versements</Text>
              </View>
              <Text style={styles.gridValue}>{contributionCount}</Text>
              <Text style={styles.gridSub}>{MOCK.analysis.trendSub}</Text>
            </View>
          </View>
        </FadeIn>

        {/* ── Graphique ── */}
        <FadeIn delay={300}>
          <TrajectoryChart />
        </FadeIn>

        {/* ── Perspectives ── */}
        <FadeIn delay={400}>
          <Text style={styles.sectionEyebrow}>Perspectives</Text>
          <View style={styles.perspectivesRow}>
            <View style={styles.perspectiveCard}>
              <View style={styles.perspectiveHeader}>
                <Text style={styles.perspectiveLabel}>Reste à épargner</Text>
                <MaterialCommunityIcons name="clock-outline" size={18} color={colors.primary} />
              </View>
              <Text style={styles.perspectiveValue}>≈ {eur(remainder)}</Text>
            </View>

            <View style={[styles.perspectiveCard, styles.perspectiveHighlight]}>
              <View style={styles.perspectiveHeader}>
                <Text style={styles.perspectiveLabel}>Gain estimé</Text>
                <MaterialCommunityIcons name="flash" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.perspectiveValue, { color: colors.primary }]}>
                +{eur(MOCK.analysis.gainPerMonth)}/mois
              </Text>
              <View style={styles.perspectiveBadge}>
                <Text style={styles.perspectiveBadgeText}>
                  {MOCK.analysis.accelerationMonths} mois gagnés
                </Text>
              </View>
            </View>
          </View>
        </FadeIn>

        {/* ── Historique des cotisations ── */}
        <FadeIn delay={500}>
          <Text style={styles.sectionEyebrow}>Historique des cotisations</Text>
          {monthGroups.map((g) => (
            <View key={g.month} style={styles.dayGroup}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>{g.month}</Text>
                <Text style={styles.dayTotal}>
                  +{eur(g.items.reduce((s, c) => s + c.amount, 0))}
                </Text>
              </View>
              <View style={styles.txList}>
                {g.items.map((c) => (
                  <View key={c.id} style={styles.txCard}>
                    <View style={[styles.txIcon, { backgroundColor: `${colors.primary}18` }]}>
                      <MaterialCommunityIcons color={colors.primary} name="bank-transfer-in" size={20} />
                    </View>
                    <View style={styles.txContent}>
                      <Text style={styles.txTitle} numberOfLines={1}>Versement</Text>
                      <Text style={styles.txCategory} numberOfLines={1}>{goal.name}</Text>
                    </View>
                    <View style={styles.txRight}>
                      <Text style={[styles.txAmount, { color: colors.primary }]}>+{eur(c.amount)}</Text>
                      <View style={[styles.txPill, { backgroundColor: "#DCE9FF" }]}>
                        <Text style={[styles.txPillText, { color: colors.text }]}>Cotisation</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </FadeIn>

        {/* ── Bloc IA Gemma ── */}
        <FadeIn delay={600}>
          <View style={styles.insightCard}>
            <View style={styles.insightBlur} />
            <View style={styles.insightInner}>
              <View style={styles.insightIconWrap}>
                <MaterialCommunityIcons name="auto-fix" size={20} color={colors.primary} />
              </View>
              <View style={styles.insightContent}>
                <Text style={styles.insightText}>{MOCK.analysis.rationale}</Text>
                <Pressable accessibilityLabel="Comprendre avec l'IA" accessibilityRole="button">
                  <View style={styles.insightBtn}>
                    <MaterialCommunityIcons name="chat-processing" size={16} color="#FFFFFF" />
                    <Text style={styles.insightBtnText}>Comprendre avec l'IA</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        </FadeIn>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
//  Styles
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { padding: 20, paddingBottom: 32 },

  /* Header */
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  headerMeta: { alignItems: "center", flex: 1, gap: 6 },
  headerCategoryRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  headerCategory: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  headerAmount: { color: colors.text, fontSize: 40, fontWeight: "800", letterSpacing: -1, lineHeight: 44 },
  headerCurrency: { fontSize: 20, fontWeight: "700" },
  trendBadge: {
    alignItems: "center",
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  trendText: { fontSize: 12, fontWeight: "700" },

  /* Alerte */
  alertCard: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: `${colors.primary}15`,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  alertIcon: { alignItems: "center", borderRadius: 12, height: 40, justifyContent: "center", width: 40 },
  alertContent: { flex: 1, gap: 2 },
  alertTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  alertDesc: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },

  /* Grille */
  grid: { flexDirection: "row", gap: 12, marginTop: 16 },
  gridCard: {
    backgroundColor: `${colors.primary}08`,
    borderRadius: 16,
    flex: 1,
    gap: 6,
    padding: 16,
  },
  gridHeader: { alignItems: "center", flexDirection: "row", gap: 6 },
  gridLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
  gridValue: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 4 },
  gridSub: { color: colors.textMuted, fontSize: 12 },

  /* Graphique */
  chartBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 0.5,
    marginTop: 16,
    overflow: "hidden",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  chartHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  chartTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  chartLegend: { alignItems: "center", flexDirection: "row", gap: 10 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 4 },
  legendDot: { borderRadius: 99, height: 8, width: 8 },
  legendText: { color: colors.textMuted, fontSize: 11, fontWeight: "500" },
  chartXAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingHorizontal: 4 },
  chartXLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "600" },

  /* Perspectives */
  sectionEyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 24,
    textTransform: "uppercase",
  },
  perspectivesRow: { flexDirection: "row", gap: 12 },
  perspectiveCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 0.5,
    flex: 1,
    gap: 6,
    overflow: "hidden",
    padding: 16,
    position: "relative",
  },
  perspectiveHighlight: { backgroundColor: `${colors.primary}08`, borderColor: `${colors.primary}20` },
  perspectiveHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  perspectiveLabel: { color: colors.text, fontSize: 13, fontWeight: "600" },
  perspectiveValue: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 4 },
  perspectiveBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 99,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  perspectiveBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },

  /* Historique des cotisations */
  dayGroup: { gap: 10 },
  dayHeader: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between" },
  dayLabel: { color: colors.textMuted, fontSize: 14, fontWeight: "500" },
  dayTotal: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
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
  txIcon: { alignItems: "center", borderRadius: 99, height: 48, justifyContent: "center", width: 48 },
  txContent: { flex: 1, gap: 2, minWidth: 0 },
  txTitle: { color: colors.text, fontSize: 16, fontWeight: "400" },
  txCategory: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  txRight: { alignItems: "flex-end", gap: 4 },
  txAmount: { color: colors.text, fontSize: 16, fontWeight: "600" },
  txPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  txPillText: { fontSize: 12, fontWeight: "600" },

  /* Insight IA */
  insightCard: {
    backgroundColor: `${colors.primary}08`,
    borderColor: `${colors.primary}18`,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 20,
    overflow: "hidden",
    padding: 16,
    position: "relative",
  },
  insightBlur: {
    backgroundColor: `${colors.primary}12`,
    borderRadius: 999,
    height: 100,
    position: "absolute",
    right: -30,
    top: -30,
    width: 100,
  },
  insightInner: { alignItems: "flex-start", flexDirection: "row", gap: 12, position: "relative", zIndex: 1 },
  insightIconWrap: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: `${colors.primary}15`,
    borderRadius: 12,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    width: 40,
  },
  insightContent: { flex: 1, gap: 10 },
  insightText: { color: colors.text, fontSize: 14, lineHeight: 22 },
  insightBtn: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 99,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  insightBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
});