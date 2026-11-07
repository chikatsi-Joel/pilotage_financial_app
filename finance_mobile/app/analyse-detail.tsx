import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Animated,
  RefreshControl,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ai as aiApi } from "../src/shared/api/ai";
import { budget as budgetApi } from "../src/shared/api/budget";
import { system as systemApi } from "../src/shared/api/system";
import { useAppStore } from "../src/shared/store";
import type { AIAnalysis, AIHealth, Recommendation } from "../src/shared/types";
import { formatMoney } from "../src/shared/utils/money";
import { colors } from "../src/ui/theme";

/* ------------------------------------------------------------------ */
//  Types
/* ------------------------------------------------------------------ */

type Deviation = {
  title: string;
  cost: string;
  costColor: string;
  iconBg: string;
  iconColor: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  desc: string;
  detail?: string;
};

type ActionItem = {
  title: string;
  desc: string;
  impact?: string;
};

/* ------------------------------------------------------------------ */
//  Layout Animation (Android)
// ------------------------------------------------------------------ */

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ------------------------------------------------------------------ */
//  Mapping API -> UI
// ------------------------------------------------------------------ */

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapAlerts(alerts: Record<string, unknown>[]): Deviation[] {
  return alerts.slice(0, 5).map((alert, index) => {
    const category = asText(alert.category) ?? "Dérive détectée";
    const variation = asNumber(alert.variation_percentage);
    const drift = asNumber(alert.drift_score);
    const cost =
      variation != null
        ? `${variation > 0 ? "+" : ""}${Math.round(variation)}%`
        : drift != null
          ? `dérive ${drift.toFixed(2)}`
          : "à surveiller";

    const facts = [
      variation != null ? `variation ${Math.round(variation)}%` : null,
      drift != null ? `drift_score ${drift.toFixed(2)}` : null,
      asNumber(alert.anomaly_score) != null
        ? `anomaly_score ${asNumber(alert.anomaly_score)!.toFixed(2)}`
        : null,
    ].filter(Boolean);

    return {
      title: category,
      cost,
      costColor: index === 0 ? colors.danger : colors.accent,
      iconBg: index === 0 ? "#FFDAD6" : "#EADDFF",
      iconColor: index === 0 ? "#93000A" : "#160066",
      icon: (asText(alert.icon) ?? "trending-up") as Deviation["icon"],
      desc:
        asText(alert.message) ??
        asText(alert.description) ??
        "Écart détecté par le moteur analytique sur cette catégorie.",
      detail: asText(alert.detail) ?? (facts.length ? facts.join(" · ") : undefined),
    };
  });
}

function mapRecommendations(recs: Record<string, unknown>[], currency: string): ActionItem[] {
  return recs.slice(0, 5).map((rec, index) => {
    const action = asText(rec.action);
    const justification = asText(rec.justification);
    const impact = asNumber(rec.impact) ?? asNumber(rec.potential_saving);
    return {
      title: action ?? `Action ${index + 1}`,
      desc:
        justification ??
        "Réduisez cette dépense pour augmenter votre capacité d'épargne mensuelle.",
      impact:
        impact != null
          ? formatMoney(impact, currency)
          : (asText(rec.category) ?? undefined),
    };
  });
}


const ACTIONS: ActionItem[] = [
  {
    title: "Action 1 : Nettoyage numérique",
    desc: "Résiliez les services inutilisés, vous pouvez réallouer 540€/an vers votre Plan Épargne Actions (PEA).",
    impact: "+540€/an",
  },
  {
    title: "Action 2 : Règle des 48h",
    desc: "Implémentez un délai de réflexion de 48h pour tout achat non-essentiel supérieur à 50€. L'IA estime une réduction de 20% des dépenses impulsives.",
    impact: "−20% impulsifs",
  },
];

/* ------------------------------------------------------------------ */
//  Composants utilitaires
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

const ScalePress = ({
  children,
  onPress,
  style,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  activeOpacity = 0.97,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
  accessibilityLabel?: string;
  accessibilityRole?: string;
  accessibilityState?: any;
  activeOpacity?: number;
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: activeOpacity,
      useNativeDriver: true,
      friction: 5,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 5,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole as any}
      accessibilityState={accessibilityState}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

/* ------------------------------------------------------------------ */
//  Sous-composants
/* ------------------------------------------------------------------ */

const DeviationCard = ({ item, index }: { item: Deviation; index: number }) => {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((p) => !p);
  };

  return (
    <FadeIn delay={200 + index * 100}>
      <ScalePress
        onPress={toggle}
        accessibilityLabel={`${item.title}, coût ${item.cost}. Appuyez pour ${expanded ? "réduire" : "voir plus de détails"}`}
        accessibilityRole="button"
      >
        <View style={styles.deviationCard}>
          <View style={[styles.devIcon, { backgroundColor: item.iconBg }]}>
            <MaterialIcons color={item.iconColor} name={item.icon} size={20} />
          </View>
          <View style={styles.devContent}>
            <View style={styles.devTitleRow}>
              <Text style={styles.devTitle}>{item.title}</Text>
              <Text style={[styles.devCost, { color: item.costColor }]}>
                {item.cost}
              </Text>
            </View>
            <Text style={styles.devDesc}>{item.desc}</Text>
            {expanded && item.detail && (
              <View style={styles.devDetailBox}>
                <MaterialCommunityIcons
                  name="information-outline"
                  size={14}
                  color={colors.textMuted}
                />
                <Text style={styles.devDetailText}>{item.detail}</Text>
              </View>
            )}
            <View style={styles.devExpandHint}>
              <MaterialCommunityIcons
                name={expanded ? "chevron-up" : "chevron-down"}
                size={16}
                color={colors.textMuted}
              />
              <Text style={styles.devExpandText}>
                {expanded ? "Moins de détails" : "Plus de détails"}
              </Text>
            </View>
          </View>
        </View>
      </ScalePress>
    </FadeIn>
  );
};

const AdviceItem = ({
  item,
  index,
  applied,
  onToggle,
}: {
  item: ActionItem;
  index: number;
  applied: boolean;
  onToggle: () => void;
}) => {
  return (
    <FadeIn delay={500 + index * 100}>
      <ScalePress
        onPress={onToggle}
        accessibilityLabel={`${item.title}. ${applied ? "Appliquée" : "Non appliquée"}. Appuyez pour changer le statut.`}
        accessibilityRole="switch"
        accessibilityState={{ checked: applied }}
      >
        <View
          style={[
            styles.adviceItem,
            applied && styles.adviceItemApplied,
          ]}
        >
          <View style={styles.adviceItemHeader}>
            <View style={styles.adviceItemText}>
              <Text
                style={[
                  styles.adviceItemTitle,
                  applied && { color: "#2D6A4F" },
                ]}
              >
                {item.title}
              </Text>
              {item.impact && (
                <View style={styles.impactBadge}>
                  <Text style={styles.impactBadgeText}>{item.impact}</Text>
                </View>
              )}
            </View>
            <View
              style={[
                styles.checkCircle,
                applied && { backgroundColor: colors.success, borderColor: colors.success },
              ]}
            >
              {applied && (
                <MaterialCommunityIcons
                  name="check"
                  size={14}
                  color="#FFFFFF"
                />
              )}
            </View>
          </View>
          <Text
            style={[
              styles.adviceItemDesc,
              applied && { color: "#40916C" },
            ]}
          >
            {item.desc}
          </Text>
        </View>
      </ScalePress>
    </FadeIn>
  );
};

/* ------------------------------------------------------------------ */
//  Page principale
/* ------------------------------------------------------------------ */

export default function AnalyseDetail() {
  const userId = useAppStore((s) => s.userId);
  const period = useAppStore((s) => s.currentPeriod);
  const currency = useAppStore((s) => s.currency);

  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [health, setHealth] = useState<AIHealth | null>(null);
  const [serverStatus, setServerStatus] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedActions, setAppliedActions] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [aiResult, aiHealth, recs, sysHealth] = await Promise.all([
        aiApi.analyze(userId, period),
        aiApi.health(userId).catch(() => null),
        budgetApi.listRecommendations(userId, period).catch(() => null),
        systemApi.health().catch(() => null),
      ]);
      setAnalysis(aiResult);
      setHealth(aiHealth);
      setRecommendations(recs?.items ?? []);
      setServerStatus(sysHealth?.status ?? null);
    } catch {
      setError("Analyse indisponible. Vérifiez la connexion au serveur.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const deviations = useMemo(
    () => mapAlerts(analysis?.alerts ?? []),
    [analysis],
  );
  const actions = useMemo(
    () => mapRecommendations(analysis?.recommendations ?? [], currency),
    [analysis, currency],
  );

  const toggleAction = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAppliedActions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const allApplied = actions.length > 0 && appliedActions.size === actions.length;

  const applyAll = useCallback(() => {
    if (allApplied) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAppliedActions(new Set(actions.map((_, i) => i)));
    if (!userId) return;
    void (async () => {
      const updated = await Promise.all(
        recommendations
          .filter((r) => r.status === "PROPOSED")
          .map((r) =>
            budgetApi
              .updateRecommendationStatus(userId, r.id, "ACCEPTED")
              .catch(() => null),
          ),
      );
      const ok = updated.filter((r): r is Recommendation => r !== null);
      if (ok.length) {
        const byId = new Map(ok.map((r) => [r.id, r]));
        setRecommendations((prev) => prev.map((r) => byId.get(r.id) ?? r));
      }
    })();
  }, [allApplied, actions, recommendations, userId]);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Executive Summary ── */}
        <FadeIn delay={0}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <MaterialCommunityIcons
                color={colors.primary}
                name="star-four-points"
                size={24}
              />
              <Text style={styles.summaryTitle}>
                Synthèse de l'Analyse {health?.configured_model ? `· ${health.configured_model}` : ""}
              </Text>
              {serverStatus === "ok" ? (
                <MaterialCommunityIcons
                  color={colors.success}
                  name="cloud-check"
                  size={18}
                />
              ) : null}
            </View>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.summaryText}>
                {analysis?.summary ?? error ?? "Aucune analyse disponible pour cette période."}
              </Text>
            )}
            {analysis?.fallback ? (
              <Text style={styles.fallbackBadge}>Analyse locale — IA indisponible</Text>
            ) : null}
            {analysis?.number_warnings?.length ? (
              <Text style={styles.warningBadge}>
                {analysis.number_warnings.length} chiffre(s) non vérifié(s) par le moteur
              </Text>
            ) : null}
          </View>
        </FadeIn>

        {/* ── Key Deviations ── */}
        <FadeIn delay={100}>
          <Text style={styles.sectionLabel}>Points de Dérive Principaux</Text>
        </FadeIn>
        <View style={styles.deviationList}>
          {deviations.length === 0 ? (
            <Text style={styles.emptyText}>
              Aucune alerte détectée sur cette période.
            </Text>
          ) : (
            deviations.map((d, i) => (
              <DeviationCard key={`${d.title}-${i}`} item={d} index={i} />
            ))
          )}
        </View>

        {/* ── Optimization Advice ── */}
        <FadeIn delay={400}>
          <View style={styles.adviceCard}>
            <View style={styles.adviceHeader}>
              <MaterialCommunityIcons
                color="#160066"
                name="lightbulb"
                size={24}
              />
              <Text style={styles.adviceTitle}>Conseils d'Optimisation</Text>
            </View>
            <View style={styles.adviceList}>
              {actions.length === 0 ? (
                <Text style={styles.emptyText}>
                  Aucune recommandation pour le moment.
                </Text>
              ) : (
                actions.map((a, i) => (
                  <AdviceItem
                    key={`${a.title}-${i}`}
                    item={a}
                    index={i}
                    applied={appliedActions.has(i)}
                    onToggle={() => toggleAction(i)}
                  />
                ))
              )}
            </View>
          </View>
        </FadeIn>

        {/* ── CTA ── */}
        <FadeIn delay={700}>
          <ScalePress
            onPress={applyAll}
            accessibilityLabel={
              allApplied
                ? "Toutes les recommandations sont appliquées"
                : "Appliquer toutes les recommandations"
            }
            accessibilityRole="button"
            accessibilityState={{ disabled: allApplied }}
          >
            <View
              style={[
                styles.cta,
                allApplied && { backgroundColor: colors.success },
              ]}
            >
              <MaterialCommunityIcons
                color="#FFFFFF"
                name={allApplied ? "check-circle" : "star-four-points"}
                size={20}
              />
              <Text style={styles.ctaText}>
                {allApplied
                  ? "Recommandations appliquées"
                  : "Appliquer les recommandations"}
              </Text>
            </View>
          </ScalePress>
        </FadeIn>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Bottom nav ── */}
      <View style={styles.bottomNav}>
        <Pressable
          style={styles.navItem}
          onPress={() => router.replace("/")}
          accessibilityLabel="Aller au tableau de bord"
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            color={colors.textMuted}
            name="view-dashboard-outline"
            size={24}
          />
          <Text style={styles.navLabel}>Dashboard</Text>
        </Pressable>
        <Pressable
          style={[styles.navItem, styles.navItemActive]}
          accessibilityLabel="Analyse active"
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            color={colors.primary}
            name="chart-timeline-variant-shimmer"
            size={24}
          />
          <Text style={[styles.navLabel, styles.navLabelActive]}>Analyse</Text>
        </Pressable>
        <Pressable
          style={styles.navItem}
          onPress={() => router.replace("/(tabs)/budget")}
          accessibilityLabel="Aller au budget"
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            color={colors.textMuted}
            name="wallet-outline"
            size={24}
          />
          <Text style={styles.navLabel}>Budget</Text>
        </Pressable>
        <Pressable
          style={styles.navItem}
          onPress={() => router.replace("/(tabs)/savings")}
          accessibilityLabel="Aller à l'épargne"
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            color={colors.textMuted}
            name="piggy-bank-outline"
            size={24}
          />
          <Text style={styles.navLabel}>Épargne</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
//  Styles
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { gap: 24, padding: 16 },

  /* Summary */
  summaryCard: {
    backgroundColor: "#DCE9FF",
    borderRadius: 12,
    gap: 12,
    marginTop: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  summaryHeader: { alignItems: "center", flexDirection: "row", gap: 8 },
  summaryTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "600",
  },
  summaryText: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  fallbackBadge: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  warningBadge: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    fontStyle: "italic",
    paddingVertical: 8,
  },

  /* Deviations */
  sectionLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  deviationList: { gap: 12 },
  deviationCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    flexDirection: "row",
    gap: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  devIcon: {
    alignItems: "center",
    borderRadius: 99,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  devContent: { flex: 1, gap: 8 },
  devTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  devTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  devCost: {
    fontSize: 14,
    fontWeight: "500",
  },
  devDesc: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  devDetailBox: {
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    padding: 10,
  },
  devDetailText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  devExpandHint: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    marginTop: 4,
  },
  devExpandText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },

  /* Advice */
  adviceCard: {
    backgroundColor: "#E4DFFF",
    borderRadius: 12,
    gap: 16,
    padding: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  adviceHeader: { alignItems: "center", flexDirection: "row", gap: 8 },
  adviceTitle: {
    color: "#160066",
    fontSize: 20,
    fontWeight: "600",
  },
  adviceList: { gap: 12 },
  adviceItem: {
    backgroundColor: "rgba(255,255,255,0.60)",
    borderRadius: 8,
    gap: 4,
    padding: 12,
  },
  adviceItemApplied: {
    backgroundColor: "rgba(212, 252, 232, 0.80)",
    borderColor: colors.success,
    borderWidth: 1,
  },
  adviceItemHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  adviceItemText: {
    flex: 1,
    gap: 6,
    paddingRight: 12,
  },
  adviceItemTitle: {
    color: "#160066",
    fontSize: 14,
    fontWeight: "500",
  },
  adviceItemDesc: {
    color: "#4234A2",
    fontSize: 14,
    lineHeight: 20,
  },
  checkCircle: {
    alignItems: "center",
    borderColor: "#C4B5FD",
    borderRadius: 99,
    borderWidth: 2,
    height: 24,
    justifyContent: "center",
    marginTop: 2,
    width: 24,
  },
  impactBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(22, 0, 102, 0.08)",
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  impactBadgeText: {
    color: "#160066",
    fontSize: 11,
    fontWeight: "700",
  },

  /* CTA */
  cta: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 99,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 8,
    paddingVertical: 14,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  /* Bottom nav */
  bottomNav: {
    backgroundColor: "rgba(255,255,255,0.90)",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    paddingBottom: 8,
    paddingTop: 8,
  },
  navItem: {
    alignItems: "center",
    flex: 1,
    gap: 2,
    justifyContent: "center",
  },
  navItemActive: {},
  navLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  navLabelActive: {
    color: colors.primary,
  },
});