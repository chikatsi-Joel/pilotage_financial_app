import React, { useMemo, useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Animated,
  RefreshControl,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Svg, {
  Circle,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";

import { BackButton } from "../src/ui/components";
import { colors } from "../src/ui/theme";

/* ------------------------------------------------------------------ */
//  Types
/* ------------------------------------------------------------------ */

type DetailParams = {
  category?: string;
  amount?: string;
  tint?: string;
  opt?: string;
};

/* ------------------------------------------------------------------ */
//  Données mockées (à remplacer par ton API)
/* ------------------------------------------------------------------ */

const MOCK = {
  habitual: 66412,
  trendLabel: "↗ En hausse",
  trendSub: "Accélération continue",
  driftSince: "3 mois",
  projectionNext: 95000,
  optimizationPotential: 21000,
  rationale:
    "Vos dépenses de logement affichent une dérive persistante par rapport à votre niveau habituel. Une renégociation de vos contrats énergétiques pourrait libérer un fort potentiel d'optimisation.",
};

/* ------------------------------------------------------------------ */
//  Coefficient d'optimisation (miroir de OptimizationPotential backend)
/* ------------------------------------------------------------------ */

const OPT_LEVELS = ["low", "medium", "high"] as const;
type OptLevel = (typeof OPT_LEVELS)[number];

const OPT_META: Record<
  OptLevel,
  { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; bg: string; fg: string }
> = {
  low: { label: "Optimisation faible", icon: "shield-outline", bg: colors.surfaceMuted, fg: colors.textMuted },
  medium: { label: "Optimisation modérée", icon: "chart-line", bg: `${colors.warning}12`, fg: colors.warning },
  high: { label: "Optimisation élevée", icon: "lightning-bolt", bg: `${colors.success}12`, fg: colors.success },
};

const OPT_COEFFICIENT: Record<OptLevel, string> = {
  low: "0,25",
  medium: "0,60",
  high: "1,00",
};

const formatXaf = (n: number) =>
  new Intl.NumberFormat("fr-FR").format(n) + " XAF";

/* ------------------------------------------------------------------ */
//  Dépenses de la catégorie (mock par catégorie)
/* ------------------------------------------------------------------ */

type CategoryExpense = {
  id: string;
  title: string;
  date: string;
  amount: number;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconBg: string;
  iconColor: string;
  pill?: string;
  pillBg?: string;
  pillColor?: string;
};

const DEFAULT_EXPENSES: CategoryExpense[] = [
  { id: "d1", title: "Achat en ligne", date: "29 août", amount: 3490, icon: "shopping", iconBg: "#E3E1ED", iconColor: "#64636D", pill: "Optimisable", pillBg: "#D3BBFF30", pillColor: colors.accent },
  { id: "d2", title: "Paiement carte", date: "22 août", amount: 1200, icon: "credit-card", iconBg: "#E3E1ED", iconColor: "#64636D" },
  { id: "d3", title: "Paiement mobile", date: "16 août", amount: 850, icon: "cellphone", iconBg: "#E3E1ED", iconColor: "#64636D" },
];

const MOCK_EXPENSES: Record<string, CategoryExpense[]> = {
  "Logement & Charges": [
    { id: "l1", title: "Loyer Appartement", date: "30 août", amount: 114000, icon: "home", iconBg: "#DCE9FF", iconColor: colors.primary, pill: "Essentielle", pillBg: "#DCE9FF", pillColor: colors.text },
    { id: "l2", title: "EDF - Électricité", date: "22 août", amount: 6200, icon: "lightning-bolt", iconBg: "#FFF0D7", iconColor: colors.warning, pill: "Optimisable", pillBg: "#D3BBFF30", pillColor: colors.accent },
    { id: "l3", title: "Internet - Orange", date: "18 août", amount: 2999, icon: "wifi", iconBg: "#E3E1ED", iconColor: "#64636D", pill: "Optimisable", pillBg: "#D3BBFF30", pillColor: colors.accent },
    { id: "l4", title: "Eau - Société Camerounaise", date: "05 août", amount: 1800, icon: "water", iconBg: "#DCE9FF", iconColor: colors.primary },
  ],
  Alimentation: [
    { id: "a1", title: "Carrefour - Courses", date: "29 août", amount: 9640, icon: "cart", iconBg: "#E3E1ED", iconColor: "#64636D", pill: "Essentielle", pillBg: "#DCE9FF", pillColor: colors.text },
    { id: "a2", title: "Marché Central", date: "24 août", amount: 4250, icon: "shopping", iconBg: "#E3E1ED", iconColor: "#64636D" },
    { id: "a3", title: "Restaurant Le Papaye", date: "12 août", amount: 3500, icon: "silverware-fork-knife", iconBg: "#D3BBFF30", iconColor: colors.accent, pill: "Optimisable", pillBg: "#D3BBFF30", pillColor: colors.accent },
    { id: "a4", title: "Carrefour Market", date: "06 août", amount: 7800, icon: "cart", iconBg: "#E3E1ED", iconColor: "#64636D" },
  ],
  Transports: [
    { id: "t1", title: "TotalEnergies - Essence", date: "27 août", amount: 5500, icon: "gas-station", iconBg: "#E3E1ED", iconColor: "#64636D" },
    { id: "t2", title: "Course Uber", date: "20 août", amount: 1800, icon: "car", iconBg: "#E3E1ED", iconColor: "#64636D" },
    { id: "t3", title: "Abonnement transport", date: "02 août", amount: 2500, icon: "bus", iconBg: "#DCE9FF", iconColor: colors.primary, pill: "Essentielle", pillBg: "#DCE9FF", pillColor: colors.text },
  ],
  "Loisirs & Sorties": [
    { id: "lo1", title: "Cinéma Pathé", date: "28 août", amount: 2200, icon: "movie", iconBg: "#D3BBFF30", iconColor: colors.accent },
    { id: "lo2", title: "Restaurant La Paillote", date: "19 août", amount: 6000, icon: "silverware-fork-knife", iconBg: "#D3BBFF30", iconColor: colors.accent, pill: "Optimisable", pillBg: "#D3BBFF30", pillColor: colors.accent },
    { id: "lo3", title: "Session Bowling", date: "15 août", amount: 3800, icon: "bowling", iconBg: "#E3E1ED", iconColor: "#64636D" },
  ],
  Santé: [
    { id: "s1", title: "Pharmacie de la Poste", date: "21 août", amount: 4100, icon: "medical-bag", iconBg: "#DCE9FF", iconColor: colors.primary, pill: "Essentielle", pillBg: "#DCE9FF", pillColor: colors.text },
    { id: "s2", title: "Consultation Dresseur", date: "10 août", amount: 3000, icon: "hospital-building", iconBg: "#E3E1ED", iconColor: "#64636D" },
  ],
  Épargne: [
    { id: "e1", title: "Virement automatique", date: "28 août", amount: 25000, icon: "piggy-bank", iconBg: "#FFF0D7", iconColor: colors.warning, pill: "Automatique", pillBg: "#FFF0D7", pillColor: colors.warning },
    { id: "e2", title: "Dépôt Livret A", date: "28 août", amount: 15000, icon: "bank", iconBg: "#DCE9FF", iconColor: colors.primary },
  ],
};

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

const SpendingChart = () => {
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
        <Text style={styles.chartTitle}>Évolution & Projection</Text>
        <View style={styles.chartLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.legendText}>Réel</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.textMuted, borderStyle: "dashed" }]} />
            <Text style={styles.legendText}>Habituel</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
            <Text style={styles.legendText}>Saison</Text>
          </View>
        </View>
      </View>

      <Animated.View style={{ opacity: pathOpacity, height: 160 }}>
        <Svg viewBox="0 0 300 120" width="100%" height="100%">
          {/* Zone saisonnière */}
          <Rect x="160" y="0" width="40" height="120" fill={`${colors.accent}18`} />
          <SvgText x="180" y="14" fill={colors.accent} fontSize="10" fontWeight="600" textAnchor="middle">
            Pic
          </SvgText>

          {/* Grid */}
          <Line x1="0" y1="30" x2="300" y2="30" stroke="#C8C4D550" strokeDasharray="2" strokeWidth="0.5" />
          <Line x1="0" y1="60" x2="300" y2="60" stroke="#C8C4D550" strokeDasharray="2" strokeWidth="0.5" />
          <Line x1="0" y1="90" x2="300" y2="90" stroke="#C8C4D550" strokeDasharray="2" strokeWidth="0.5" />

          {/* Baseline */}
          <Line x1="0" y1="75" x2="300" y2="75" stroke={colors.textMuted} strokeDasharray="4 4" strokeWidth="1.5" />
          <SvgText x="4" y="71" fill={colors.textMuted} fontSize="9">
            Niveau habituel (66k)
          </SvgText>

          {/* Trend */}
          <Line x1="0" y1="85" x2="220" y2="25" stroke="#7165D3" strokeDasharray="2 2" strokeWidth="1" opacity="0.6" />

          {/* Real spending */}
          <Path
            d="M0 80 Q 50 75, 100 60 T 180 30 T 220 15"
            fill="none"
            stroke={colors.primary}
            strokeWidth="2.5"
          />
          <Circle cx="100" cy="60" r="3" fill={colors.primary} />
          <Circle cx="180" cy="30" r="3" fill={colors.primary} />
          <Circle cx="220" cy="15" r="4" fill={colors.primary} stroke="#FFFFFF" strokeWidth="2" />

          {/* Forecast */}
          <Path
            d="M220 15 Q 260 5, 300 0"
            fill="none"
            stroke={colors.accent}
            strokeDasharray="2 4"
            strokeWidth="2"
            opacity="0.7"
          />
          <Circle cx="300" cy="0" r="3" fill={colors.accent} opacity="0.7" />
          <SvgText x="270" y="14" fill={colors.accent} fontSize="10">
            Proj.
          </SvgText>
        </Svg>
      </Animated.View>
    </View>
  );
};

/* ------------------------------------------------------------------ */
//  Page principale
/* ------------------------------------------------------------------ */

export default function BudgetDetail() {
  const params = useLocalSearchParams<DetailParams>();
  const [refreshing, setRefreshing] = React.useState(false);

  const category = params.category ?? "Logement & Charges";
  const amount = Number(params.amount ?? 87000);
  const tint = params.tint ?? colors.primary;
  const optLevel: OptLevel =
    params.opt === "low" || params.opt === "medium" || params.opt === "high"
      ? params.opt
      : "medium";
  const optMeta = OPT_META[optLevel];
  const expenses = MOCK_EXPENSES[category] ?? DEFAULT_EXPENSES;

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  const pctVsHabitual = useMemo(() => {
    if (MOCK.habitual === 0) return 0;
    return Math.round(((amount - MOCK.habitual) / MOCK.habitual) * 100);
  }, [amount]);

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
            <BackButton size={24} />
            <View style={styles.headerMeta}>
              <View style={styles.headerCategoryRow}>
                <MaterialCommunityIcons
                  name="home"
                  size={16}
                  color={tint}
                />
                <Text style={[styles.headerCategory, { color: tint }]}>
                  {category}
                </Text>
              </View>
              <Text style={styles.headerAmount}>
                {new Intl.NumberFormat("fr-FR").format(amount)}{" "}
                <Text style={styles.headerCurrency}>XAF</Text>
              </Text>
              <View style={styles.headerBadges}>
                <View style={[styles.trendBadge, { backgroundColor: `${colors.danger}12` }]}>
                  <MaterialCommunityIcons
                    name="trending-up"
                    size={14}
                    color={colors.danger}
                  />
                  <Text style={[styles.trendText, { color: colors.danger }]}>
                    +{pctVsHabitual}% vs habituel
                  </Text>
                </View>
                <View style={[styles.optBadge, { backgroundColor: optMeta.bg }]}>
                  <MaterialCommunityIcons name={optMeta.icon} size={14} color={optMeta.fg} />
                  <Text style={[styles.optText, { color: optMeta.fg }]}>{optMeta.label}</Text>
                </View>
              </View>
            </View>
            <View style={{ width: 24 }} />
          </View>
        </FadeIn>

        {/* ── Alerte dérive ── */}
        <FadeIn delay={100}>
          <View style={styles.alertCard}>
            <View style={[styles.alertIcon, { backgroundColor: `${colors.primary}12` }]}>
              <MaterialCommunityIcons
                name="alert-circle"
                size={18}
                color={colors.primary}
              />
            </View>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>Dérive persistante</Text>
              <Text style={styles.alertDesc}>
                Dépenses anormalement élevées depuis {MOCK.driftSince}.
              </Text>
            </View>
          </View>
        </FadeIn>

        {/* ── Grille 2 cols ── */}
        <FadeIn delay={200}>
          <View style={styles.grid}>
            <View style={styles.gridCard}>
              <View style={styles.gridHeader}>
                <MaterialCommunityIcons
                  name="chart-bar"
                  size={14}
                  color={colors.textMuted}
                />
                <Text style={styles.gridLabel}>Niveau habituel</Text>
              </View>
              <Text style={styles.gridValue}>
                {new Intl.NumberFormat("fr-FR").format(MOCK.habitual)} XAF
              </Text>
              <Text style={styles.gridSub}>Médiane historique</Text>
            </View>

            <View style={styles.gridCard}>
              <View style={styles.gridHeader}>
                <MaterialCommunityIcons
                  name="trending-up"
                  size={14}
                  color={colors.textMuted}
                />
                <Text style={styles.gridLabel}>Tendance</Text>
              </View>
              <Text style={styles.gridValue}>{MOCK.trendLabel}</Text>
              <Text style={styles.gridSub}>{MOCK.trendSub}</Text>
            </View>
          </View>
        </FadeIn>

        {/* ── Graphique ── */}
        <FadeIn delay={300}>
          <SpendingChart />
        </FadeIn>

        {/* ── Perspectives ── */}
        <FadeIn delay={400}>
          <Text style={styles.sectionEyebrow}>Perspectives</Text>
          <View style={styles.perspectivesRow}>
            <View style={styles.perspectiveCard}>
              <View style={styles.perspectiveHeader}>
                <Text style={styles.perspectiveLabel}>Projection prochain</Text>
                <MaterialCommunityIcons
                  name="calendar-month"
                  size={18}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.perspectiveValue}>
                ≈ {new Intl.NumberFormat("fr-FR").format(MOCK.projectionNext)} XAF
              </Text>
            </View>

            <View style={[styles.perspectiveCard, styles.perspectiveHighlight]}>
              <View style={styles.perspectiveHeader}>
                <Text style={styles.perspectiveLabel}>Potentiel d'optimisation</Text>
                <MaterialCommunityIcons
                  name="piggy-bank"
                  size={18}
                  color={colors.primary}
                />
              </View>
              <Text style={[styles.perspectiveValue, { color: colors.primary }]}>
                ≈ {new Intl.NumberFormat("fr-FR").format(MOCK.optimizationPotential)} XAF
              </Text>
              <Text style={styles.perspectiveCoeff}>
                Coefficient d'optimisation : {OPT_COEFFICIENT[optLevel]}
              </Text>
              <View style={[styles.perspectiveBadge, { backgroundColor: optMeta.fg }]}>
                <Text style={styles.perspectiveBadgeText}>{optMeta.label}</Text>
              </View>
            </View>
          </View>
        </FadeIn>


        {/* ── Dépenses de la catégorie ── */}
        <FadeIn delay={350}>
          <Text style={styles.sectionEyebrow}>Dépenses du mois</Text>
          <View style={styles.expensesList}>
            {expenses.map((tx) => (
              <View key={tx.id} style={styles.txCard}>
                <View style={[styles.txIcon, { backgroundColor: tx.iconBg }]}>
                  <MaterialCommunityIcons
                    name={tx.icon}
                    size={22}
                    color={tx.iconColor}
                  />
                </View>
                <View style={styles.txContent}>
                  <Text style={styles.txTitle} numberOfLines={1}>
                    {tx.title}
                  </Text>
                  <Text style={styles.txDate}>{tx.date}</Text>
                </View>
                <View style={styles.txRight}>
                  <Text style={styles.txAmount}>-{formatXaf(tx.amount)}</Text>
                  {tx.pill && (
                    <View style={[styles.txPill, { backgroundColor: tx.pillBg }]}>
                      <Text style={[styles.txPillText, { color: tx.pillColor }]}>
                        {tx.pill}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        </FadeIn>

        {/* ── Bloc IA Gemma ── */}
        <FadeIn delay={500}>
          <View style={styles.insightCard}>
            <View style={styles.insightBlur} />
            <View style={styles.insightInner}>
              <View style={styles.insightIconWrap}>
                <MaterialCommunityIcons
                  name="auto-fix"
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View style={styles.insightContent}>
                <Text style={styles.insightText}>{MOCK.rationale}</Text>
                <Pressable
                  accessibilityLabel="Comprendre avec l'IA"
                  accessibilityRole="button"
                >
                  <View style={styles.insightBtn}>
                    <MaterialCommunityIcons
                      name="chat-processing"
                      size={16}
                      color="#FFFFFF"
                    />
                    <Text style={styles.insightBtnText}>
                      Comprendre avec l'IA
                    </Text>
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
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },

  /* Header */
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  headerMeta: {
    alignItems: "center",
    flex: 1,
    gap: 6,
  },
  headerCategoryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  headerCategory: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  headerAmount: {
    color: colors.text,
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -1,
    lineHeight: 44,
  },
  headerCurrency: {
    fontSize: 20,
    fontWeight: "700",
  },
  headerBadges: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
    marginTop: 2,
  },
  trendBadge: {
    alignItems: "center",
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  trendText: {
    fontSize: 12,
    fontWeight: "700",
  },
  optBadge: {
    alignItems: "center",
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  optText: {
    fontSize: 12,
    fontWeight: "700",
  },

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
  alertIcon: {
    alignItems: "center",
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  alertContent: {
    flex: 1,
    gap: 2,
  },
  alertTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  alertDesc: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },

  /* Grille */
  grid: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  gridCard: {
    backgroundColor: `${colors.primary}08`,
    borderRadius: 16,
    flex: 1,
    gap: 6,
    padding: 16,
  },
  gridHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  gridLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  gridValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
  },
  gridSub: {
    color: colors.textMuted,
    fontSize: 12,
  },

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
  chartHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  chartTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  chartLegend: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  legendItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  legendDot: {
    borderRadius: 99,
    height: 8,
    width: 8,
  },
  legendText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "500",
  },

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

  /* Dépenses de la catégorie */
  expensesList: { gap: 10 },
  txCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  txIcon: {
    alignItems: "center",
    borderRadius: 99,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  txContent: { flex: 1, gap: 2, minWidth: 0 },
  txTitle: { color: colors.text, fontSize: 15, fontWeight: "500" },
  txDate: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  txRight: { alignItems: "flex-end", gap: 4 },
  txAmount: { color: colors.text, fontSize: 15, fontWeight: "700" },
  txPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  txPillText: { fontSize: 11, fontWeight: "700" },
  perspectivesRow: {
    flexDirection: "row",
    gap: 12,
  },
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
  perspectiveHighlight: {
    backgroundColor: `${colors.primary}08`,
    borderColor: `${colors.primary}20`,
  },
  perspectiveHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  perspectiveLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  perspectiveValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 4,
  },
  perspectiveCoeff: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  perspectiveBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 99,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  perspectiveBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },

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
  insightInner: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    position: "relative",
    zIndex: 1,
  },
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
  insightContent: {
    flex: 1,
    gap: 10,
  },
  insightText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
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
  insightBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});