import React, { useCallback, useRef } from "react";
import {
  ActivityIndicator,
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
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { describeTrend } from "../src/shared/utils/trend";
import Svg, {
  Circle,
  Line,
  Path,
  Text as SvgText,
} from "react-native-svg";

import { BackButton } from "../src/ui/components";
import { AiExplain } from "../src/ui/AiExplain";
import { analytics as analyticsApi } from "../src/shared/api/analytics";
import { expenses as expensesApi, type DailyTotal } from "../src/shared/api/expenses";
import { usePagedExpenses } from "../src/shared/hooks/usePagedExpenses";
import { useAppStore } from "../src/shared/store";
import type { CategoryAnalytics } from "../src/shared/types";
import { formatMoney } from "../src/shared/utils/money";
import { colors } from "../src/ui/theme";
import { formatPct } from "../src/shared/utils/format";

/* ------------------------------------------------------------------ */
//  Types
/* ------------------------------------------------------------------ */

type DetailParams = {
  catId?: string;
  category?: string;
  amount?: string;
  tint?: string;
  opt?: string;
  icon?: string;
  allocated?: string;
};

const OPT_LEVELS = ["low", "medium", "high"] as const;
type OptLevel = (typeof OPT_LEVELS)[number];

function optFromScore(cat: CategoryAnalytics): OptLevel {
  if (cat.opportunity_score >= 0.6) return "high";
  if (cat.opportunity_score >= 0.35) return "medium";
  return "low";
}

function txDate(iso: string): string {
  const d = new Date(iso);
  const label = d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  return sameDay ? `Aujourd'hui, ${label}` : label;
}

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

const SpendingChart = ({
  baseline = 0,
  forecast = 0,
  daily = [],
  period,
  tint = colors.primary,
}: {
  baseline?: number;
  forecast?: number;
  daily?: DailyTotal[];
  period: string;
  tint?: string;
}) => {
  const pathOpacity = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(pathOpacity, {
      toValue: 1,
      duration: 1200,
      delay: 400,
      useNativeDriver: true,
    }).start();
  }, [pathOpacity]);

  const W = 300;
  const H = 120;
  const PAD = { l: 12, r: 12, t: 8, b: 10 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const [y, m] = (period || "2026-01").split("-").map(Number);
  const lastDay = new Date(y, m || 1, 0).getDate() || 30;
  const now = new Date();
  const todayDay = Math.max(1, Math.min(now.getDate(), lastDay));

  const cumByDay = new Map<number, number>();
  let running = 0;
  const sorted = [...daily]
    .filter((d) => d.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const d of sorted) {
    const day = new Date(d.date).getDate();
    running += d.total;
    cumByDay.set(day, running);
  }
  const cumToday = running;
  const maxVal = Math.max(cumToday, baseline, forecast, 1);

  const x = (day: number) => PAD.l + (day / lastDay) * plotW;
  const yFor = (v: number) => PAD.t + plotH - (v / maxVal) * plotH;

  const realPoints: Array<[number, number]> = [[0, 0]];
  let acc = 0;
  for (let d = 1; d <= todayDay; d++) {
    const v = cumByDay.get(d);
    if (v !== undefined) acc = v;
    realPoints.push([d, acc]);
  }
  const realPath = realPoints
    .map(([d, v], i) => `${i ? "L" : "M"} ${x(d).toFixed(1)} ${yFor(v).toFixed(1)}`)
    .join(" ");

  const habPath = `M ${x(0).toFixed(1)} ${yFor(0).toFixed(1)} L ${x(lastDay).toFixed(1)} ${yFor(baseline).toFixed(1)}`;
  const projPath = `M ${x(todayDay).toFixed(1)} ${yFor(acc).toFixed(1)} L ${x(lastDay).toFixed(1)} ${yFor(forecast).toFixed(1)}`;

  const gridYs = [0.25, 0.5, 0.75].map((f) => PAD.t + plotH * f);

  return (
    <View style={styles.chartBox}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>Évolution & Projection</Text>
        <View style={styles.chartLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: tint }]} />
            <Text style={styles.legendText}>Réel</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.textMuted, borderStyle: "dashed" }]} />
            <Text style={styles.legendText}>Habituel</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
            <Text style={styles.legendText}>Projection</Text>
          </View>
        </View>
      </View>

      <Animated.View style={{ opacity: pathOpacity, height: 160 }}>
        <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%">
          {/* Grid */}
          {gridYs.map((gy) => (
            <Line
              key={gy}
              x1={PAD.l}
              y1={gy}
              x2={W - PAD.r}
              y2={gy}
              stroke="#C8C4D550"
              strokeDasharray="2"
              strokeWidth="0.5"
            />
          ))}

          {/* Habituel (cumul attendu) */}
          <Path
            d={habPath}
            stroke={colors.textMuted}
            strokeDasharray="4 4"
            strokeWidth="1.5"
            fill="none"
          />
          <SvgText x={x(2)} y={Math.max(yFor(baseline) - 5, 10)} fill={colors.textMuted} fontSize="9">
            Habituel
          </SvgText>

          {/* Projection */}
          <Path
            d={projPath}
            stroke={colors.accent}
            strokeDasharray="2 4"
            strokeWidth="2"
            fill="none"
            opacity="0.75"
          />
          <Circle cx={x(lastDay)} cy={yFor(forecast)} r="3" fill={colors.accent} opacity="0.8" />
          <SvgText x={x(lastDay) - 4} y={Math.max(yFor(forecast) - 8, 10)} fill={colors.accent} fontSize="10" textAnchor="end">
            Proj.
          </SvgText>

          {/* Réel (cumul du mois) */}
          <Path
            d={realPath}
            fill="none"
            stroke={tint}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={x(todayDay)} cy={yFor(acc)} r="4" fill={tint} stroke="#FFFFFF" strokeWidth="2" />
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
  const userId = useAppStore((s) => s.userId);
  const currency = useAppStore((s) => s.currency);
  const period = useAppStore((s) => s.currentPeriod);

  const [refreshing, setRefreshing] = React.useState(false);
  const [cat, setCat] = React.useState<CategoryAnalytics | null>(null);
  const [daily, setDaily] = React.useState<DailyTotal[]>([]);

  const { from, to } = React.useMemo(() => {
    const [y, m] = period.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return {
      from: `${period}-01`,
      to: `${period}-${String(lastDay).padStart(2, "0")}`,
    };
  }, [period]);
  const listCategoryId = params.catId || cat?.category_id || undefined;
  const {
    items: expenses,
    loadingMore,
    hasMore,
    reload: reloadList,
    loadMore,
  } = usePagedExpenses({
    userId,
    from,
    to,
    categoryId: listCategoryId,
    pageSize: 20,
    enabled: !!listCategoryId,
  });

  const category = params.category ?? cat?.name ?? "Logement & Charges";
  const amount = cat?.current_amount ?? Number(params.amount ?? 0);
  const tint = params.tint ?? colors.primary;
  const allocated = Number(params.allocated ?? 0) || 0;
  const remaining = allocated > 0 ? allocated - amount : null;
  const icon =
    params.icon && params.icon in MaterialCommunityIcons.glyphMap
      ? (params.icon as keyof typeof MaterialCommunityIcons.glyphMap)
      : "home";
  const optLevel: OptLevel =
    params.opt === "low" || params.opt === "medium" || params.opt === "high"
      ? params.opt
      : cat
        ? optFromScore(cat)
        : "medium";
  const optMeta = OPT_META[optLevel];

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      if (!userId) return;
      const cats = await analyticsApi.categories(userId, period);
      const categoryId = params.catId || "";
      const catName = params.category?.trim().toLowerCase();
      const match =
        cats.find((c) => c.category_id === categoryId) ??
        (catName
          ? cats.find(
              (c) => c.name.trim().toLowerCase() === catName
            )
          : null) ??
        null;
      setCat(match);
      const expenseCategoryId = categoryId || match?.category_id || null;
      if (!expenseCategoryId) {
        setDaily([]);
        return;
      }
      setDaily(
        await expensesApi.daily(userId, { from, to, categoryId: expenseCategoryId }),
      );
    } catch {
      setCat(null);
      setDaily([]);
    } finally {
      setRefreshing(false);
    }
  }, [userId, period, from, to, params.catId, params.category]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useFocusEffect(
    useCallback(() => {
      void reloadList();
    }, [reloadList])
  );

  const baseline = cat?.baseline_amount ?? 0;
  const pctVsHabitual = cat?.variation_percentage ?? 0;
  const { label: trendLabel, sub: trendSub } = describeTrend(cat?.profile ?? null);
  const driftScore = cat?.profile.drift_score ?? 0;
  const driftSince = cat ? "ce mois-ci" : "";
  const projection = cat?.profile.forecast.value ?? 0;
  const potential = cat?.potential_saving ?? 0;
  const rationale = cat
    ? `Vos dépenses "${cat.name}" affichent une variation de ${formatPct(
        cat.variation_percentage
      )} par rapport à votre niveau habituel. Réduire cette dérive libérerait environ ${formatMoney(
        cat.potential_saving,
        currency
      )} par mois.`
    : "Analyse indisponible pour cette catégorie.";

  const onRefresh = useCallback(() => {
    load();
  }, [load]);

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
                  name={icon}
                  size={16}
                  color={tint}
                />
                <Text style={[styles.headerCategory, { color: tint }]}>
                  {category}
                </Text>
              </View>
              <Text style={[styles.headerAmount, allocated > 0 && styles.headerAmountSmall]}>
                {formatMoney(allocated > 0 ? allocated : amount, currency)}
              </Text>
              {allocated > 0 && remaining !== null && (
                <>
                  <Text style={styles.headerAllocatedLabel}>
                    Budget alloué
                  </Text>
                  <View style={styles.headerAllocated}>
                    <Text style={styles.headerAllocatedValue}>
                      Dépensé : {formatMoney(amount, currency)}
                    </Text>
                    <Text
                      style={[
                        styles.headerAllocatedValue,
                        {
                          color:
                            remaining >= 0
                              ? colors.success
                              : colors.danger,
                          fontWeight: "700",
                        },
                      ]}
                    >
                      {remaining >= 0
                        ? `Il reste ${formatMoney(remaining, currency)}`
                        : `Dépassement de ${formatMoney(
                            -remaining,
                            currency
                          )}`}
                    </Text>
                  </View>
                </>
              )}
              <View style={styles.headerBadges}>
                <View style={[styles.trendBadge, { backgroundColor: `${pctVsHabitual >= 0 ? colors.danger : colors.success}12` }]}>
                  <MaterialCommunityIcons
                    name={pctVsHabitual >= 0 ? "trending-up" : "trending-down"}
                    size={14}
                    color={pctVsHabitual >= 0 ? colors.danger : colors.success}
                  />
                  <Text style={[styles.trendText, { color: pctVsHabitual >= 0 ? colors.danger : colors.success }]}>
                    {formatPct(pctVsHabitual)} vs habituel
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
              <Text style={styles.alertTitle}>
                {driftScore > 0.6 ? "Dérive persistante" : "État de la dérive"}
              </Text>
              <Text style={styles.alertDesc}>
                {cat
                  ? driftScore > 0.6
                    ? `Dépenses en dérive depuis ${driftSince} (score ${Math.round(
                        driftScore * 100
                      )}/100).`
                    : "Pas de dérive majeure détectée ce mois sur cette catégorie."
                  : "Aucune donnée analytique disponible pour cette catégorie."}
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
                {formatMoney(baseline, currency)}
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
              <Text style={styles.gridValue}>{trendLabel}</Text>
              <Text style={styles.gridSub}>{trendSub}</Text>
            </View>
          </View>
        </FadeIn>

        {/* ── Graphique ── */}
        <FadeIn delay={300}>
          <SpendingChart
            baseline={baseline}
            forecast={projection}
            daily={daily}
            period={period}
            tint={tint}
          />
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
                ≈ {formatMoney(projection, currency)}
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
                ≈ {formatMoney(potential, currency)}
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
          {expenses.length === 0 ? (
            <Text style={styles.emptyText}>
              Aucune dépense enregistrée pour {category} ce mois-ci.
            </Text>
          ) : (
            <View style={styles.expensesList}>
              {expenses.map((tx) => (
                <View key={tx.id} style={styles.txCard}>
                  <View
                    style={[
                      styles.txIcon,
                      {
                        backgroundColor: cat?.essential
                          ? "#DCE9FF"
                          : "#D3BBFF30",
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="credit-card-outline"
                      size={22}
                      color={cat?.essential ? colors.primary : colors.accent}
                    />
                  </View>
                  <View style={styles.txContent}>
                    <Text style={styles.txTitle} numberOfLines={1}>
                      {tx.note || "Dépense"}
                    </Text>
                    <Text style={styles.txDate}>{txDate(tx.expense_date)}</Text>
                  </View>
                  <View style={styles.txRight}>
                    <Text style={styles.txAmount}>
                      -{formatMoney(tx.amount, currency)}
                    </Text>
                    <View
                      style={[
                        styles.txPill,
                        {
                          backgroundColor: cat?.essential
                            ? "#DCE9FF"
                            : "#D3BBFF30",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.txPillText,
                          {
                            color: cat?.essential
                              ? colors.text
                              : colors.accent,
                          },
                        ]}
                      >
                        {cat?.essential ? "Essentielle" : "Optimisable"}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
              {hasMore || loadingMore ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={loadingMore}
                  onPress={() => void loadMore()}
                  style={styles.moreBtn}
                >
                  {loadingMore ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={styles.moreText}>Voir plus de dépenses</Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          )}
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
                <Text style={styles.insightText}>{rationale}</Text>
                <AiExplain period={period} focus={category} />
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
  headerAmountSmall: {
    fontSize: 32,
    lineHeight: 36,
  },
  headerAllocated: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  headerAllocatedLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  headerAllocatedValue: {
    fontSize: 13,
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
  moreBtn: {
    alignItems: "center",
    backgroundColor: `${colors.primary}12`,
    borderRadius: 12,
    paddingVertical: 12,
  },
  moreText: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: 12,
    textAlign: "center",
  },
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