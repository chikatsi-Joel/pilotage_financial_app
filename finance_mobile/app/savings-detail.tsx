import React, { useCallback, useMemo, useRef, useState } from "react";
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
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
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
import { savings as savingsApi } from "../src/shared/api/savings";
import { useAppStore } from "../src/shared/store";
import type { SavingsGoal } from "../src/shared/types";
import { formatMoney } from "../src/shared/utils/money";
import { colors } from "../src/ui/theme";
import { capitalize } from "../src/shared/utils/format";
import { buildSavingsTrajectory, type SavingsTrajectory } from "../src/shared/utils/savingsTrajectory";

/* ------------------------------------------------------------------ */
//  Helpers
/* ------------------------------------------------------------------ */

const monthLabel = (iso: string) =>
  capitalize(new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));

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

const shortMonth = (t: number) =>
  new Date(t).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });

const TrajectoryChart = ({
  traj,
  currency,
}: {
  traj: SavingsTrajectory;
  currency: string;
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
  const H = 130;
  const PAD = { l: 6, r: 10, t: 16, b: 6 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const maxVal = Math.max(traj.target, traj.current, traj.paceEnd?.[1] ?? 0, 1) * 1.05;

  /* Échelle en deux parties : le passé (début → aujourd'hui) occupe toujours PAST_SHARE de la
     largeur, sinon quelques jours de versements disparaissent face à une échéance lointaine. */
  const PAST_SHARE = 0.35;
  const frac = (t: number) => {
    if (t <= traj.today) {
      return ((t - traj.start) / Math.max(traj.today - traj.start, 1)) * PAST_SHARE;
    }
    return PAST_SHARE + ((t - traj.today) / Math.max(traj.end - traj.today, 1)) * (1 - PAST_SHARE);
  };
  const x = (t: number) => PAD.l + Math.min(Math.max(frac(t), 0), 1) * plotW;
  const y = (v: number) => PAD.t + plotH - (v / maxVal) * plotH;
  const pct = (t: number) => Math.min(Math.max(frac(t), 0), 1) * 100;

  /* Le cumul monte par paliers à chaque versement. */
  const [first, ...rest] = traj.real;
  let realPath = `M ${x(first[0]).toFixed(1)} ${y(first[1]).toFixed(1)}`;
  for (const [t, v] of rest) {
    realPath += ` H ${x(t).toFixed(1)} V ${y(v).toFixed(1)}`;
  }
  const areaPath = `${realPath} V ${y(0).toFixed(1)} H ${x(first[0]).toFixed(1)} Z`;

  const showNeeded = traj.neededPace !== null && traj.deadline > traj.today;
  const neededPath = showNeeded
    ? `M ${x(traj.today).toFixed(1)} ${y(traj.current).toFixed(1)} L ${x(traj.deadline).toFixed(1)} ${y(traj.target).toFixed(1)}`
    : null;
  const pacePath = traj.paceEnd
    ? `M ${x(traj.today).toFixed(1)} ${y(traj.current).toFixed(1)} L ${x(traj.paceEnd[0]).toFixed(1)} ${y(traj.paceEnd[1]).toFixed(1)}`
    : null;

  const status: { text: string; tone: string } = traj.reached
    ? { text: "Objectif atteint, bravo !", tone: colors.success }
    : traj.deadline <= traj.today
      ? { text: "L'échéance est dépassée : choisissez une nouvelle date pour cet objectif.", tone: colors.warning }
      : traj.reachDate === null
        ? {
            text: `Aucun versement ces 3 derniers mois. Il faudrait ≈ ${formatMoney(traj.neededPace ?? 0, currency)}/mois pour tenir l'échéance.`,
            tone: colors.warning,
          }
        : traj.reachDate <= traj.deadline
          ? { text: `À ce rythme, objectif atteint vers ${monthLabel(new Date(traj.reachDate).toISOString())}, avant l'échéance.`, tone: colors.success }
          : {
              text: `À ce rythme, objectif atteint vers ${monthLabel(new Date(traj.reachDate).toISOString())}, après l'échéance. Il faudrait ≈ ${formatMoney(traj.neededPace ?? 0, currency)}/mois.`,
              tone: colors.warning,
            };

  const ticks = [
    { t: traj.start, label: shortMonth(traj.start) },
    { t: traj.today, label: "Auj." },
    { t: traj.deadline, label: shortMonth(traj.deadline) },
  ].filter((tick, i, all) => i === 0 || Math.abs(pct(tick.t) - pct(all[i - 1].t)) > 14);

  return (
    <View style={styles.chartBox}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>Trajectoire & Projection</Text>
      </View>
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={styles.legendText}>Réel</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accent, opacity: 0.6 }]} />
          <Text style={styles.legendText}>Rythme actuel</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.textMuted, borderStyle: "dashed" },
            ]}
          />
          <Text style={styles.legendText}>Nécessaire</Text>
        </View>
      </View>

      <Animated.View style={{ opacity: pathOpacity, height: 170 }}>
        <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%">
          <Defs>
            <LinearGradient id="realFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.22} />
              <Stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {[0.25, 0.5, 0.75].map((f) => (
            <Line
              key={f}
              x1={PAD.l}
              y1={PAD.t + plotH * f}
              x2={W - PAD.r}
              y2={PAD.t + plotH * f}
              stroke="#C8C4D550"
              strokeDasharray="2"
              strokeWidth="0.5"
            />
          ))}

          {/* Aujourd'hui */}
          <Line
            x1={x(traj.today)}
            y1={PAD.t}
            x2={x(traj.today)}
            y2={PAD.t + plotH}
            stroke={`${colors.primary}40`}
            strokeDasharray="2 3"
            strokeWidth="0.75"
          />

          {/* Échéance */}
          <Line
            x1={x(traj.deadline)}
            y1={PAD.t}
            x2={x(traj.deadline)}
            y2={PAD.t + plotH}
            stroke="#C8C4D5"
            strokeWidth="0.75"
          />

          {/* Cible */}
          <Line
            x1={PAD.l}
            y1={y(traj.target)}
            x2={W - PAD.r}
            y2={y(traj.target)}
            stroke={colors.textMuted}
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <SvgText x={PAD.l + 2} y={y(traj.target) - 4} fill={colors.textMuted} fontSize="9">
            {`Cible ${formatMoney(traj.target, currency)}`}
          </SvgText>

          {/* Rythme nécessaire */}
          {neededPath ? (
            <Path d={neededPath} fill="none" stroke={colors.textMuted} strokeDasharray="3 4" strokeWidth="1.5" />
          ) : null}

          {/* Réel */}
          <Path d={areaPath} fill="url(#realFill)" />
          <Path d={realPath} fill="none" stroke={colors.primary} strokeWidth="2.5" strokeLinejoin="round" />

          {/* Rythme actuel */}
          {pacePath && traj.paceEnd ? (
            <>
              <Path d={pacePath} fill="none" stroke={colors.accent} strokeDasharray="5 4" strokeWidth="2" opacity="0.6" />
              <Circle cx={x(traj.paceEnd[0])} cy={y(traj.paceEnd[1])} r="3" fill={colors.accent} opacity="0.7" />
            </>
          ) : null}

          <Circle cx={x(traj.today)} cy={y(traj.current)} r="4" fill={colors.primary} stroke="#FFFFFF" strokeWidth="2" />
        </Svg>
      </Animated.View>

      <View style={styles.chartXAxis}>
        {ticks.map((tick) => (
          <Text
            key={tick.label}
            numberOfLines={1}
            style={[styles.chartXLabel, { left: `${pct(tick.t)}%` }]}
          >
            {tick.label}
          </Text>
        ))}
      </View>

      <View style={[styles.chartStatus, { backgroundColor: `${status.tone}12` }]}>
        <MaterialCommunityIcons
          color={status.tone}
          name={status.tone === colors.success ? "check-circle-outline" : "alert-circle-outline"}
          size={16}
        />
        <Text style={[styles.chartStatusText, { color: status.tone }]}>{status.text}</Text>
      </View>
    </View>
  );
};

/* ------------------------------------------------------------------ */
//  Page principale
/* ------------------------------------------------------------------ */

type DetailParams = {
  id?: string;
  goal?: string;
  current?: string;
  target?: string;
  deadline?: string;
};

export default function SavingsDetail() {
  const params = useLocalSearchParams<DetailParams>();
  const userId = useAppStore((s) => s.userId);
  const currency = useAppStore((s) => s.currency);
  const period = useAppStore((s) => s.currentPeriod);

  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [goal, setGoal] = useState<SavingsGoal | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      if (!userId) return;
      const res = await savingsApi.list(userId, { limit: 100 });
      const match =
        res.items.find((g) => g.id === params.id) ??
        res.items.find((g) => g.name === params.goal) ??
        res.items[0] ??
        null;
      setGoal(match);
    } catch {
      setGoal(null);
    } finally {
      setRefreshing(false);
    }
  }, [userId, params.id, params.goal]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    load();
  }, [load]);

  const contributions = goal?.contributions ?? [];
  const pct =
    goal && goal.target_amount > 0
      ? Math.round((goal.current_amount / goal.target_amount) * 100)
      : 0;
  const remainder = goal ? Math.max(goal.target_amount - goal.current_amount, 0) : 0;
  const deadlineLabel = goal ? monthLabel(goal.deadline) : "";
  const contributionCount = contributions.length;

  const traj = useMemo(
    () =>
      goal
        ? buildSavingsTrajectory({
            contributions,
            current: goal.current_amount,
            target: goal.target_amount,
            deadline: goal.deadline,
            today: new Date(),
          })
        : null,
    [goal, contributions],
  );
  const monthlyPace = Math.round(traj?.monthlyPace ?? 0);

  const rationale = goal
    ? contributions.length > 0
      ? `Vous versez en moyenne ≈ ${formatMoney(monthlyPace, currency)}/mois sur "${goal.name}" (3 derniers mois).${
          traj?.neededPace != null
            ? ` Pour tenir l'échéance, il faut ≈ ${formatMoney(traj.neededPace, currency)}/mois.`
            : ""
        }`
      : `Aucun versement pour l'instant sur "${goal.name}". Commencez par un petit montant régulier.`
    : "Aucun objectif d'épargne trouvé pour ce compte.";

  const MAX_VISIBLE = 6;

  const monthGroups = useMemo(() => {
    const map = new Map<string, { month: string; items: SavingsGoal["contributions"] }>();
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

  const visibleGroups = useMemo(() => {
    if (showAll) return monthGroups.map((g) => ({ ...g, complete: true }));
    const out: { month: string; items: typeof contributions; complete: boolean }[] = [];
    let n = 0;
    for (const g of monthGroups) {
      if (n >= MAX_VISIBLE) break;
      const room = MAX_VISIBLE - n;
      if (g.items.length <= room) {
        out.push({ ...g, complete: true });
        n += g.items.length;
      } else {
        out.push({ ...g, items: g.items.slice(0, room), complete: false });
        n = MAX_VISIBLE;
      }
    }
    return out;
  }, [monthGroups, showAll]);

  const hiddenCount = contributionCount - visibleGroups.reduce((s, g) => s + g.items.length, 0);

  const contribute = () =>
    goal &&
    router.push({
      pathname: "/add-contribution",
      params: {
        goalId: goal.id,
        goal: goal.name,
        current: String(goal.current_amount),
        target: String(goal.target_amount),
      },
    });

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
            <View style={styles.headerTop}>
              <BackButton size={24} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Verser de l'argent sur ${goal?.name ?? "l'objectif"}`}
                disabled={!goal}
                hitSlop={8}
                onPress={contribute}
                style={({ pressed }) => [
                  styles.contributeBtn,
                  pressed && styles.contributePressed,
                  !goal && { opacity: 0.5 },
                ]}
              >
                <MaterialCommunityIcons color={colors.primary} name="plus" size={16} />
                <Text style={styles.contributeText}>Verser</Text>
              </Pressable>
            </View>
            <View style={styles.headerMeta}>
              <View style={styles.headerCategoryRow}>
                <MaterialCommunityIcons name="piggy-bank" size={16} color={colors.primary} />
                <Text style={[styles.headerCategory, { color: colors.primary }]}>Objectif d'épargne</Text>
              </View>
              <Text style={styles.headerAmount}>
                {formatMoney(goal?.current_amount ?? 0, currency)}
              </Text>
              <View style={[styles.trendBadge, { backgroundColor: `${colors.success}12` }]}>
                <MaterialCommunityIcons name="arrow-up" size={14} color={colors.success} />
                <Text style={[styles.trendText, { color: colors.success }]}>{pct}% atteint</Text>
              </View>
            </View>
          </View>
        </FadeIn>

        {/* ── Dynamique des versements ── */}
        <FadeIn delay={100}>
          <View style={styles.alertCard}>
            <View style={[styles.alertIcon, { backgroundColor: `${colors.primary}12` }]}>
              <MaterialCommunityIcons name="piggy-bank" size={18} color={colors.primary} />
            </View>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>
                {contributionCount > 0 ? "Bonne dynamique" : "Commencez à épargner"}
              </Text>
              <Text style={styles.alertDesc}>
                {contributionCount > 0
                  ? `Versements réguliers enregistrés sur "${goal?.name}".`
                  : "Ajoutez des versements réguliers pour visualiser votre trajectoire."}
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
              <Text style={styles.gridValue}>{formatMoney(goal?.target_amount ?? 0, currency)}</Text>
              <Text style={styles.gridSub}>Avant {deadlineLabel}</Text>
            </View>

            <View style={styles.gridCard}>
              <View style={styles.gridHeader}>
                <MaterialCommunityIcons name="bank-transfer-in" size={14} color={colors.textMuted} />
                <Text style={styles.gridLabel}>Versements</Text>
              </View>
              <Text style={styles.gridValue}>{contributionCount}</Text>
              <Text style={styles.gridSub}>Historique constaté</Text>
            </View>
          </View>
        </FadeIn>

        {/* ── Graphique ── */}
        <FadeIn delay={300}>
          {traj ? <TrajectoryChart currency={currency} traj={traj} /> : null}
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
              <Text style={styles.perspectiveValue}>≈ {formatMoney(remainder, currency)}</Text>
            </View>

            <View style={[styles.perspectiveCard, styles.perspectiveHighlight]}>
              <View style={styles.perspectiveHeader}>
                <Text style={styles.perspectiveLabel}>Rythme constaté</Text>
                <MaterialCommunityIcons name="flash" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.perspectiveValue, { color: colors.primary }]}>
                ≈ {formatMoney(monthlyPace, currency)}/mois
              </Text>
              <View style={styles.perspectiveBadge}>
                <Text style={styles.perspectiveBadgeText}>
                  {contributionCount > 0 ? "Moyenne 3 derniers mois" : "En attente de versements"}
                </Text>
              </View>
            </View>
          </View>
        </FadeIn>

        {/* ── Historique des cotisations ── */}
        <FadeIn delay={500}>
          <View style={styles.historyHeaderRow}>
            <Text style={styles.sectionEyebrow}>Historique des cotisations</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{contributionCount} versements</Text>
            </View>
          </View>
          <View style={styles.historyBox}>
            {visibleGroups.map((g) => (
              <View key={g.month} style={styles.dayGroup}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayLabel}>{g.month}</Text>
                  {g.complete && (
                    <Text style={styles.dayTotal}>
                      +{formatMoney(g.items.reduce((s, c) => s + c.amount, 0), currency)}
                    </Text>
                  )}
                </View>
                <View style={styles.txList}>
                  {g.items.map((c) => (
                    <View key={c.id} style={styles.txCard}>
                      <View style={[styles.txIcon, { backgroundColor: `${colors.primary}18` }]}>
                        <MaterialCommunityIcons color={colors.primary} name="bank-transfer-in" size={20} />
                      </View>
                      <View style={styles.txContent}>
                        <Text style={styles.txTitle} numberOfLines={1}>Versement</Text>
                        <Text style={styles.txCategory} numberOfLines={1}>{goal?.name}</Text>
                      </View>
                      <View style={styles.txRight}>
                        <Text style={[styles.txAmount, { color: colors.primary }]}>+{formatMoney(c.amount, currency)}</Text>
                        <View style={[styles.txPill, { backgroundColor: "#DCE9FF" }]}>
                          <Text style={[styles.txPillText, { color: colors.text }]}>Cotisation</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))}
            {hiddenCount > 0 && (
              <Pressable style={styles.seeMoreBtn} onPress={() => setShowAll(true)}>
                <MaterialCommunityIcons name="chevron-down" size={16} color={colors.primary} />
                <Text style={styles.seeMoreText}>
                  Voir les {hiddenCount} versements précédents
                </Text>
              </Pressable>
            )}
          </View>
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
                <Text style={styles.insightText}>{rationale}</Text>
                <AiExplain period={period} focus={goal?.name} />
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
  header: { gap: 4, marginTop: 4 },
  headerTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  headerMeta: { alignItems: "center", gap: 6 },
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

  /* Versement */
  contributeBtn: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  contributePressed: { opacity: 0.7 },
  contributeText: { color: colors.primary, fontSize: 13, fontWeight: "700" },

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
  chartHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  chartTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  chartLegend: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 8 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 4 },
  legendDot: { borderRadius: 99, height: 8, width: 8 },
  legendText: { color: colors.textMuted, fontSize: 11, fontWeight: "500" },
  chartXAxis: { height: 16, marginHorizontal: 22, marginTop: 4, position: "relative" },
  chartXLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "600",
    marginLeft: -22,
    position: "absolute",
    textAlign: "center",
    width: 44,
  },
  chartStatus: {
    alignItems: "flex-start",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    padding: 10,
  },
  chartStatusText: { flex: 1, fontSize: 12, fontWeight: "600", lineHeight: 17 },

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
  historyHeaderRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  countBadge: { backgroundColor: `${colors.primary}0D`, borderRadius: 99, marginTop: 24, paddingHorizontal: 10, paddingVertical: 4 },
  countBadgeText: { color: colors.primary, fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  historyBox: { gap: 16 },
  seeMoreBtn: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 99,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  seeMoreText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
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