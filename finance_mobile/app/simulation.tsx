import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { analytics as analyticsApi } from "../src/shared/api/analytics";
import { budget as budgetApi } from "../src/shared/api/budget";
import { whatIf as whatIfApi } from "../src/shared/api/whatIf";
import { useAppStore } from "../src/shared/store";
import type { CategoryAnalytics, Recommendation, WhatIfResult } from "../src/shared/types";
import { formatMoney } from "../src/shared/utils/money";
import { EmptyState, ScreenHeader } from "../src/ui/components";
import { colors } from "../src/ui/theme";

function percentLabel(value: number): string {
  return `${Math.round(value)}%`;
}

export default function Simulation() {
  const userId = useAppStore((s) => s.userId);
  const period = useAppStore((s) => s.currentPeriod);
  const currency = useAppStore((s) => s.currency);

  const [categories, setCategories] = useState<CategoryAnalytics[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [percent, setPercent] = useState(20);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [currentSavings, setCurrentSavings] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [deciding, setDeciding] = useState(false);

  const selected = useMemo(
    () => categories.find((c) => c.category_id === selectedId) ?? null,
    [categories, selectedId],
  );

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [cats, dash, recs] = await Promise.all([
        analyticsApi.categories(userId, period),
        analyticsApi.dashboard(userId, period),
        budgetApi.listRecommendations(userId, period).catch(() => null),
      ]);

      setCategories(cats);
      setCurrentSavings(dash.savings);
      setSelectedId((prev) =>
        prev && cats.some((c) => c.category_id === prev) ? prev : (cats[0]?.category_id ?? null),
      );
      setRecommendation(
        recs?.items.find((r) => r.status === "PROPOSED") ?? recs?.items[0] ?? null,
      );
    } catch {
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [userId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId || !selectedId) {
      setResult(null);
      return;
    }
    const categoryId = selectedId;
    let cancelled = false;
    setSimulating(true);
    const timer = setTimeout(async () => {
      try {
        const res = await whatIfApi.simulate(userId, period, {
          category_id: categoryId,
          reduction_percent: percent,
        });
        if (!cancelled) setResult(res);
      } catch {
        if (!cancelled) setResult(null);
      } finally {
        if (!cancelled) setSimulating(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId, period, selectedId, percent]);

  const projected = (currentSavings ?? 0) + (result?.monthly_saving ?? 0);
  const gain = result?.monthly_saving ?? 0;

  const decide = useCallback(
    async (status: "ACCEPTED" | "REJECTED") => {
      if (!userId || !recommendation) return;
      setDeciding(true);
      try {
        const updated = await budgetApi.updateRecommendationStatus(
          userId,
          recommendation.id,
          status,
        );
        setRecommendation(updated);
      } catch {
        /* silencieux : la carte reste dans son état précédent */
      } finally {
        setDeciding(false);
      }
    },
    [userId, recommendation],
  );

  if (!userId) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ScreenHeader title="Simulation" />
        <EmptyState title="Aucune session active" subtitle="Lancez l'inscription pour simuler." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScreenHeader title="Simulation" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero card */}
        <View style={styles.hero}>
          <View style={styles.heroDeco1} />
          <View style={styles.heroDeco2} />
          <Text style={styles.heroLabel}>Épargne projetée (fin de mois)</Text>
          <View style={styles.heroRow}>
            <Text style={styles.heroAmount}>{formatMoney(projected, currency)}</Text>
            {gain > 0 ? (
              <View style={styles.heroBadge}>
                <MaterialCommunityIcons color="#FFFFFF" name="trending-up" size={14} />
                <Text style={styles.heroBadgeText}>+{formatMoney(gain, currency)}</Text>
              </View>
            ) : null}
          </View>
          {simulating ? (
            <ActivityIndicator color="#FFFFFF" style={styles.heroSpinner} />
          ) : null}
        </View>

        {/* Scenarios */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Testez vos scénarios</Text>
          <Text style={styles.sectionDesc}>
            Choisissez une catégorie et ajustez la réduction pour mesurer l&apos;impact sur votre
            épargne.
          </Text>

          {loading ? (
            <View style={styles.card}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : categories.length === 0 ? (
            <View style={styles.card}>
              <EmptyState
                title="Aucune catégorie"
                subtitle="Ajoutez des dépenses pour obtenir des projections."
              />
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.chipRow}>
                {categories.map((c) => {
                  const active = c.category_id === selectedId;
                  return (
                    <Pressable
                      key={c.category_id}
                      onPress={() => setSelectedId(c.category_id)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {c.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.sliderHead}>
                <View style={styles.sliderLabel}>
                  <MaterialCommunityIcons
                    color={colors.textMuted}
                    name="arrow-collapse-down"
                    size={20}
                  />
                  <Text style={styles.sliderLabelText}>Réduction</Text>
                </View>
                <Text style={styles.sliderVal}>{percentLabel(percent)}</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={50}
                step={5}
                value={percent}
                onValueChange={(v) => setPercent(v as number)}
                minimumTrackTintColor={colors.primary}
                maximumTrackTintColor={colors.border}
                thumbTintColor="#FFFFFF"
              />
              <View style={styles.sliderRange}>
                <Text style={styles.sliderRangeText}>0%</Text>
                <Text style={styles.sliderRangeText}>50%</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.resultRow}>
                <ResultCell
                  label="Actuel"
                  value={formatMoney(selected?.current_amount ?? 0, currency)}
                />
                <ResultCell
                  label="Nouvelle cible"
                  value={formatMoney(result?.new_target ?? 0, currency)}
                />
              </View>
              <View style={[styles.resultRow, styles.resultRowLast]}>
                <ResultCell
                  label="Économie mensuelle"
                  value={formatMoney(result?.monthly_saving ?? 0, currency)}
                />
                <ResultCell
                  label="Économie annuelle"
                  value={formatMoney(result?.annual_saving ?? 0, currency)}
                />
              </View>
            </View>
          )}
        </View>

        {/* Recommandation */}
        {recommendation ? (
          <View style={styles.reco}>
            <View style={styles.recoTop}>
              <View style={styles.recoIcon}>
                <MaterialCommunityIcons
                  color={colors.primary}
                  name="star-four-points"
                  size={20}
                />
              </View>
              <View style={styles.recoCopy}>
                <Text style={styles.recoTitle}>{recommendation.category_name}</Text>
                <Text style={styles.recoDesc}>{recommendation.justification}</Text>
                <Text style={styles.recoImpact}>
                  Impact estimé : {formatMoney(recommendation.impact_estimated, currency)}
                </Text>
              </View>
            </View>
            <View style={styles.recoBtns}>
              <Pressable
                disabled={deciding || recommendation.status === "REJECTED"}
                style={styles.btnIgnore}
                onPress={() => decide("REJECTED")}
              >
                <Text style={styles.btnIgnoreText}>
                  {recommendation.status === "REJECTED" ? "Rejetée" : "Ignorer"}
                </Text>
              </Pressable>
              <Pressable
                disabled={deciding || recommendation.status === "ACCEPTED"}
                style={[
                  styles.btnApply,
                  (deciding || recommendation.status === "ACCEPTED") && { opacity: 0.6 },
                ]}
                onPress={() => decide("ACCEPTED")}
              >
                <Text style={styles.btnApplyText}>
                  {recommendation.status === "ACCEPTED" ? "Acceptée" : "Appliquer"}
                </Text>
                <MaterialCommunityIcons color="#FFFFFF" name="check" size={18} />
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const ResultCell = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.resultCell}>
    <Text style={styles.resultLabel}>{label}</Text>
    <Text style={styles.resultValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scroll: { paddingBottom: 32 },

  hero: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    elevation: 4,
    gap: 6,
    marginHorizontal: 16,
    marginTop: 24,
    overflow: "hidden",
    padding: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  heroDeco1: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 999,
    height: 128,
    position: "absolute",
    right: -48,
    top: -48,
    width: 128,
  },
  heroDeco2: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 999,
    height: 96,
    left: -32,
    bottom: -32,
    width: 96,
  },
  heroLabel: {
    color: "rgba(255,255,255,0.80)",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  heroAmount: { color: "#FFFFFF", fontSize: 40, fontWeight: "700", letterSpacing: -1.5, lineHeight: 48, flexShrink: 1 },
  heroBadge: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  heroBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  heroSpinner: { marginTop: 4 },

  section: { gap: 4, marginTop: 28 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "600", paddingHorizontal: 16 },
  sectionDesc: { color: colors.textMuted, fontSize: 16, lineHeight: 24, paddingHorizontal: 16 },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    elevation: 2,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: { backgroundColor: colors.surfaceMuted, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13, fontWeight: "500" },
  chipTextActive: { color: "#FFFFFF" },

  sliderHead: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  sliderLabel: { alignItems: "center", flexDirection: "row", gap: 8 },
  sliderLabelText: { color: colors.text, fontSize: 14, fontWeight: "500" },
  sliderVal: { color: colors.primary, fontSize: 20, fontWeight: "600" },
  slider: { height: 32, marginHorizontal: -8 },
  sliderRange: { flexDirection: "row", justifyContent: "space-between" },
  sliderRangeText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  divider: { backgroundColor: colors.border, height: 1, marginVertical: 12 },

  resultRow: { flexDirection: "row", gap: 12 },
  resultRowLast: { marginTop: 12 },
  resultCell: { flex: 1, gap: 2 },
  resultLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  resultValue: { color: colors.text, fontSize: 16, fontWeight: "800" },

  reco: {
    backgroundColor: "#DCE9FF",
    borderRadius: 16,
    gap: 16,
    marginHorizontal: 16,
    marginTop: 20,
    padding: 16,
  },
  recoTop: { flexDirection: "row", gap: 12 },
  recoIcon: {
    alignItems: "center",
    backgroundColor: `${colors.primary}1A`,
    borderRadius: 99,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  recoCopy: { flex: 1, gap: 4 },
  recoTitle: { color: colors.text, fontSize: 20, fontWeight: "600" },
  recoDesc: { color: colors.textMuted, fontSize: 16, lineHeight: 24 },
  recoImpact: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  recoBtns: { flexDirection: "row", gap: 12 },
  btnIgnore: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnIgnoreText: { color: colors.primary, fontSize: 14, fontWeight: "500" },
  btnApply: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 12,
    elevation: 2,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  btnApplyText: { color: "#FFFFFF", fontSize: 14, fontWeight: "500" },
});
