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
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { describeTrend } from "../src/shared/utils/trend";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
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
import { colors, fonts, interFonts } from "../src/ui/theme";
import { formatPct } from "../src/shared/utils/format";
import { buildSpendingSeries } from "../src/shared/utils/spendingChart";
import { groupByDate } from "../src/shared/utils/paging";
import { optimizationCoefficient } from "../src/shared/utils/optimization";

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
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
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
  daily = [],
  period,
  currency,
  tint = colors.primary,
}: {
  baseline?: number;
  daily?: DailyTotal[];
  period: string;
  currency: string;
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

  const { lastDay, todayDay, real, cumulative, projectedEnd } = React.useMemo(
    () => buildSpendingSeries({ period: period || "2026-01", daily, baseline, today: new Date() }),
    [period, daily, baseline],
  );
  const maxVal = Math.max(cumulative, baseline, projectedEnd ?? 0, 1);

  const x = (day: number) => PAD.l + (day / lastDay) * plotW;
  const yFor = (v: number) => PAD.t + plotH - (v / maxVal) * plotH;

  const realPath = real
    .map(([d, v], i) => `${i ? "L" : "M"} ${x(d).toFixed(1)} ${yFor(v).toFixed(1)}`)
    .join(" ");
  const areaPath = `${realPath} L ${x(todayDay).toFixed(1)} ${yFor(0).toFixed(1)} L ${x(0).toFixed(1)} ${yFor(0).toFixed(1)} Z`;
  const vsHabitual = projectedEnd !== null && baseline > 0 ? projectedEnd / baseline - 1 : null;
  const [py, pm] = (period || "2026-01").split("-").map(Number);
  const monthShort = new Date(py, (pm || 1) - 1, 1).toLocaleDateString("fr-FR", { month: "short" });

  const habPath = `M ${x(0).toFixed(1)} ${yFor(0).toFixed(1)} L ${x(lastDay).toFixed(1)} ${yFor(baseline).toFixed(1)}`;
  const projPath =
    projectedEnd === null
      ? null
      : `M ${x(todayDay).toFixed(1)} ${yFor(cumulative).toFixed(1)} L ${x(lastDay).toFixed(1)} ${yFor(projectedEnd).toFixed(1)}`;

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
          <Defs>
            <LinearGradient id="catRealFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={tint} stopOpacity={0.22} />
              <Stop offset="100%" stopColor={tint} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {/* Grille */}
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

          {/* Aujourd'hui */}
          {projectedEnd !== null ? (
            <Line
              x1={x(todayDay)}
              y1={PAD.t}
              x2={x(todayDay)}
              y2={PAD.t + plotH}
              stroke={`${tint}40`}
              strokeDasharray="2 3"
              strokeWidth="0.75"
            />
          ) : null}

          {/* Habituel (cumul attendu au fil du mois) */}
          {baseline > 0 ? (
            <>
              <Path d={habPath} stroke={colors.textMuted} strokeDasharray="4 4" strokeWidth="1.25" fill="none" opacity="0.7" />
              <SvgText
                x={x(lastDay) - 2}
                y={Math.min(yFor(baseline) + 11, PAD.t + plotH - 2)}
                fill={colors.textMuted}
                fontSize="8.5"
                textAnchor="end"
              >
                {`Habituel ${formatMoney(baseline, currency)}`}
              </SvgText>
            </>
          ) : null}

          {/* Projection de fin de mois (mois en cours uniquement), discrète */}
          {projPath && projectedEnd !== null ? (
            <>
              <Line
                x1={PAD.l}
                y1={yFor(projectedEnd)}
                x2={x(lastDay)}
                y2={yFor(projectedEnd)}
                stroke={colors.accent}
                strokeDasharray="2 3"
                strokeWidth="1"
                opacity="0.3"
              />
              <SvgText
                x={PAD.l + 2}
                y={Math.max(yFor(projectedEnd) - 4, 9)}
                fill={colors.accent}
                fontSize="8.5"
                fontWeight="600"
                opacity="0.6"
              >
                {`Projection ${formatMoney(projectedEnd, currency)}`}
              </SvgText>
              <Path d={projPath} stroke={colors.accent} strokeDasharray="2 4" strokeWidth="2" fill="none" opacity="0.6" />
              <Circle cx={x(lastDay)} cy={yFor(projectedEnd)} r="3.5" fill="#FFFFFF" stroke={colors.accent} strokeWidth="1.5" opacity="0.7" />
            </>
          ) : null}

          {/* Réel (cumul du mois) */}
          <Path d={areaPath} fill="url(#catRealFill)" />
          <Path
            d={realPath}
            fill="none"
            stroke={tint}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={x(todayDay)} cy={yFor(cumulative)} r="4" fill={tint} stroke="#FFFFFF" strokeWidth="2" />
        </Svg>
      </Animated.View>

      <View style={styles.chartAxis}>
        <Text style={[styles.chartAxisLabel, { left: "0%" }]}>1 {monthShort}</Text>
        {projectedEnd !== null && todayDay / lastDay > 0.18 && todayDay / lastDay < 0.82 ? (
          <Text style={[styles.chartAxisLabel, { left: `${(todayDay / lastDay) * 100}%` }]}>Auj.</Text>
        ) : null}
        <Text style={[styles.chartAxisLabel, { left: "100%" }]}>
          {lastDay} {monthShort}
        </Text>
      </View>

      <View style={styles.chartSummary}>
        <View style={styles.chartSummaryCell}>
          <Text style={styles.chartSummaryLabel}>Dépensé à ce jour</Text>
          <Text style={styles.chartSummaryValue}>{formatMoney(cumulative, currency)}</Text>
        </View>
        <View style={styles.chartSummaryDivider} />
        <View style={styles.chartSummaryCell}>
          <Text style={styles.chartSummaryLabel}>
            {projectedEnd !== null ? "Projection fin de mois" : "Habituel"}
          </Text>
          <Text style={[styles.chartSummaryValue, projectedEnd !== null && { color: colors.accent, opacity: 0.8 }]}>
            {projectedEnd !== null ? `≈ ${formatMoney(projectedEnd, currency)}` : formatMoney(baseline, currency)}
          </Text>
          {vsHabitual !== null ? (
            <Text
              style={[
                styles.chartSummarySub,
                { color: vsHabitual > 0.05 ? colors.danger : vsHabitual < -0.05 ? colors.success : colors.textMuted },
              ]}
            >
              {vsHabitual > 0 ? "+" : "−"}
              {Math.abs(Math.round(vsHabitual * 100))} % vs habituel
            </Text>
          ) : projectedEnd !== null ? (
            <Text style={styles.chartSummarySub}>si vous gardez ce rythme</Text>
          ) : null}
        </View>
      </View>
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
                          fontFamily: interFonts.bold,
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
            currency={currency}
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
                Coefficient d'optimisation :{" "}
                {cat ? `${optimizationCoefficient(cat.opportunity_score)} / 1` : "—"}
              </Text>
              <View style={[styles.perspectiveBadge, { backgroundColor: optMeta.fg }]}>
                <Text style={styles.perspectiveBadgeText}>{optMeta.label}</Text>
              </View>
            </View>
          </View>
        </FadeIn>


        {/* ── Dépenses de la catégorie : relevé groupé par jour ── */}
        <FadeIn delay={350}>
          <View style={styles.ledgerHead}>
            <Text style={styles.ledgerTitle}>Dépenses du mois</Text>
            {expenses.length > 0 ? (
              <Text style={styles.ledgerTotal}>Total {formatMoney(amount, currency)}</Text>
            ) : null}
          </View>
          {expenses.length === 0 ? (
            <Text style={styles.emptyText}>
              Aucune dépense enregistrée pour {category} ce mois-ci.
            </Text>
          ) : (
            <View style={styles.ledger}>
              <View pointerEvents="none" style={styles.ledgerOrb} />
              {groupByDate(expenses.map((x) => ({ ...x, date: x.expense_date }))).map((day) => (
                <View key={day.date} style={styles.tlDay}>
                  <View style={styles.tlDayHead}>
                    <Text style={styles.tlDayLabel}>{txDate(day.date)}</Text>
                    <View style={styles.tlDayRule} />
                    <Text style={styles.tlDayTotal}>
                      {formatMoney(day.items.reduce((s, x) => s + x.amount, 0), currency)}
                    </Text>
                  </View>
                  {day.items.map((tx, i) => {
                    const last = i === day.items.length - 1;
                    return (
                      <Pressable
                        key={tx.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Modifier ${tx.note || "la dépense"}`}
                        onPress={() =>
                          router.push({
                            pathname: "/add-expense",
                            params: {
                              id: tx.id,
                              amount: String(tx.amount),
                              categoryId: tx.category_id,
                              date: tx.expense_date,
                              note: tx.note ?? "",
                            },
                          })
                        }
                        style={({ pressed }) => [styles.tlRow, pressed && styles.tlRowPressed]}
                      >
                        <View style={styles.tlRail}>
                          <View style={[styles.tlLine, i === 0 && styles.tlLineFirst, last && styles.tlLineLast]} />
                          <View style={[styles.tlDot, { borderColor: tint }]} />
                        </View>
                        <Text
                          numberOfLines={1}
                          style={[styles.tlNote, !tx.note && styles.tlNoteEmpty]}
                        >
                          {tx.note || "Sans description"}
                        </Text>
                        <View style={styles.tlPill}>
                          <Text style={styles.tlPillText}>−{formatMoney(tx.amount, currency)}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              {hasMore || loadingMore ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={loadingMore}
                  onPress={() => void loadMore()}
                  style={styles.ledgerMore}
                >
                  {loadingMore ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={[styles.moreText, styles.ledgerMoreText]}>Voir les dépenses plus anciennes</Text>
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
    fontSize: 11,
    fontFamily: interFonts.bold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  headerAmount: {
    color: colors.text,
    fontSize: 37,
    fontFamily: interFonts.bold,
    letterSpacing: -1,
    lineHeight: 40,
  },
  headerAmountSmall: {
    fontSize: 29, fontFamily: interFonts.regular,
    lineHeight: 33,
  },
  headerAllocated: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  headerAllocatedLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: interFonts.bold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  headerAllocatedValue: {
    fontSize: 12, fontFamily: interFonts.regular,
  },
  headerCurrency: {
    fontSize: 18,
    fontFamily: interFonts.bold,
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
    fontSize: 11,
    fontFamily: interFonts.bold,
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
    fontSize: 11,
    fontFamily: interFonts.bold,
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
    fontSize: 13,
    fontFamily: interFonts.bold,
  },
  alertDesc: {
    color: colors.textMuted,
    fontSize: 12, fontFamily: interFonts.regular,
    lineHeight: 17,
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
    fontSize: 10,
    fontFamily: interFonts.semibold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  gridValue: {
    color: colors.text,
    fontSize: 17,
    fontFamily: interFonts.bold,
    marginTop: 4,
  },
  gridSub: {
    color: colors.textMuted,
    fontSize: 11, fontFamily: interFonts.regular,
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
    fontSize: 13,
    fontFamily: interFonts.semibold,
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
    fontSize: 10,
    fontFamily: interFonts.medium,
  },
  chartAxis: { height: 16, marginHorizontal: 22, marginTop: 2, position: "relative" },
  chartAxisLabel: {
    color: colors.textMuted,
    fontFamily: interFonts.medium,
    fontSize: 10,
    marginLeft: -22,
    position: "absolute",
    textAlign: "center",
    width: 44,
  },
  chartSummary: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 12,
    flexDirection: "row",
    marginTop: 10,
    paddingVertical: 10,
  },
  chartSummaryCell: { alignItems: "center", flex: 1, gap: 1, paddingHorizontal: 6 },
  chartSummaryDivider: { backgroundColor: colors.border, height: 36, width: 1 },
  chartSummaryLabel: { color: colors.textMuted, fontFamily: interFonts.medium, fontSize: 11 },
  chartSummaryValue: { color: colors.text, fontFamily: interFonts.semibold, fontSize: 15 },
  chartSummarySub: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 10 },

  /* Perspectives */
  sectionEyebrow: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: interFonts.bold,
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 24,
    textTransform: "uppercase",
  },

  /* Dépenses de la catégorie */
  ledgerHead: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  ledgerTitle: {
    color: colors.text,
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 16,
    marginBottom: 10,
    marginTop: 24,
  },
  ledgerTotal: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 13 },
  ledger: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 8,
    paddingHorizontal: 14,
    position: "relative",
  },
  ledgerOrb: {
    backgroundColor: `${colors.primary}0D`,
    borderRadius: 999,
    height: 110,
    position: "absolute",
    right: -40,
    top: -50,
    width: 110,
  },
  tlDay: { paddingTop: 14 },
  tlDayHead: { alignItems: "center", flexDirection: "row", gap: 10, marginBottom: 2 },
  tlDayLabel: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  tlDayRule: { backgroundColor: colors.border, flex: 1, height: 1 },
  tlDayTotal: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 13 },
  tlRow: {
    alignItems: "center",
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    minHeight: 48,
    paddingRight: 4,
  },
  tlRowPressed: { backgroundColor: colors.surfaceMuted },
  tlRail: { alignItems: "center", alignSelf: "stretch", justifyContent: "center", width: 22 },
  tlLine: {
    backgroundColor: `${colors.primary}33`,
    bottom: 0,
    position: "absolute",
    top: 0,
    width: 2,
  },
  tlLineFirst: { top: "50%" },
  tlLineLast: { bottom: "50%" },
  tlDot: {
    backgroundColor: colors.surface,
    borderRadius: 99,
    borderWidth: 3,
    height: 12,
    width: 12,
  },
  tlNote: { color: colors.text, flex: 1, fontFamily: fonts.regular, fontSize: 14 },
  tlNoteEmpty: { color: colors.textMuted, fontFamily: fonts.regular },
  tlPill: {
    backgroundColor: colors.primarySoft,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tlPillText: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 13 },
  ledgerMoreText: { fontFamily: fonts.semibold, fontWeight: "normal" },
  ledgerMore: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 12,
    paddingBottom: 4,
  },
  moreText: { color: colors.primary, fontSize: 13, fontFamily: interFonts.bold },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13, fontFamily: interFonts.regular,
    paddingVertical: 12,
    textAlign: "center",
  },
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
    fontSize: 12,
    fontFamily: interFonts.semibold,
  },
  perspectiveValue: {
    color: colors.text,
    fontSize: 18,
    fontFamily: interFonts.bold,
    marginTop: 4,
  },
  perspectiveCoeff: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: interFonts.semibold,
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
    fontSize: 10,
    fontFamily: interFonts.bold,
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
    fontSize: 13, fontFamily: interFonts.regular,
    lineHeight: 20,
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
    fontSize: 12,
    fontFamily: interFonts.bold,
  },
});