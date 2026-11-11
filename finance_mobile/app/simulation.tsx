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
import { useFocusEffect } from "expo-router";

import { analytics as analyticsApi } from "../src/shared/api/analytics";
import { budget as budgetApi } from "../src/shared/api/budget";
import { whatIf as whatIfApi } from "../src/shared/api/whatIf";
import { useAppStore } from "../src/shared/store";
import type { CategoryAnalytics, Recommendation, WhatIfResult } from "../src/shared/types";
import { formatMoney } from "../src/shared/utils/money";
import { EmptyState, ScreenHeader } from "../src/ui/components";
import { colors, interFonts } from "../src/ui/theme";

function percentLabel(value: number): string {
  return `${Math.round(value)}%`;
}

/** Résultat de simulation rattaché aux paramètres qui l'ont produit. */
interface Simulated {
  categoryId: string;
  percent: number;
  data: WhatIfResult;
}

export default function Simulation() {
  const userId = useAppStore((s) => s.userId);
  const period = useAppStore((s) => s.currentPeriod);
  const currency = useAppStore((s) => s.currency);

  const [categories, setCategories] = useState<CategoryAnalytics[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [percent, setPercent] = useState(20);
  const [simulated, setSimulated] = useState<Simulated | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);

  const selected = useMemo(
    () => categories.find((c) => c.category_id === selectedId) ?? null,
    [categories, selectedId],
  );

  /* N'afficher un résultat que s'il correspond exactement aux réglages visibles. */
  const result =
    simulated && simulated.categoryId === selectedId && simulated.percent === percent
      ? simulated.data
      : null;

  const recommendation = useMemo(() => {
    if (!selected) return null;
    const forCategory = recommendations.filter((r) => r.category_id === selected.category_id);
    return forCategory.find((r) => r.status === "PROPOSED") ?? forCategory[0] ?? null;
  }, [recommendations, selected]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [cats, recs] = await Promise.all([
        analyticsApi.categories(userId, period),
        budgetApi.listRecommendations(userId, period).catch(() => null),
      ]);
      /* Une catégorie sans dépense ni historique donnerait 0 partout. */
      const useful = cats.filter((c) => c.current_amount > 0 || c.baseline_amount > 0);
      setCategories(useful);
      setSelectedId((prev) =>
        prev && useful.some((c) => c.category_id === prev) ? prev : (useful[0]?.category_id ?? null),
      );
      setRecommendations(recs?.items ?? []);
    } catch {
      setCategories([]);
      setLoadError("Impossible de charger vos catégories. Vérifiez la connexion au serveur.");
    } finally {
      setLoading(false);
    }
  }, [userId, period]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!userId || !selectedId) {
      setSimulating(false);
      return;
    }
    const categoryId = selectedId;
    const requested = percent;
    let cancelled = false;
    setSimulating(true);
    setSimError(null);
    const timer = setTimeout(async () => {
      try {
        const data = await whatIfApi.simulate(userId, period, {
          category_id: categoryId,
          reduction_percent: requested,
        });
        if (!cancelled) setSimulated({ categoryId, percent: requested, data });
      } catch {
        if (!cancelled) setSimError("Simulation impossible pour le moment. Réessayez.");
      } finally {
        if (!cancelled) setSimulating(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId, period, selectedId, percent]);

  const gain = result?.monthly_saving ?? 0;
  const rate = result?.projected_savings_rate ?? null;
  const pending = !result && !simError;

  const decide = useCallback(
    async (status: "ACCEPTED" | "REJECTED") => {
      if (!userId || !recommendation) return;
      setDeciding(true);
      setDecideError(null);
      try {
        const updated = await budgetApi.updateRecommendationStatus(
          userId,
          recommendation.id,
          status,
        );
        setRecommendations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      } catch {
        setDecideError("Impossible d'enregistrer votre choix. Réessayez.");
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
          <Text style={styles.heroLabel}>Économie possible par mois</Text>
          <View style={styles.heroRow}>
            <Text adjustsFontSizeToFit numberOfLines={1} style={styles.heroAmount}>
              {pending ? "…" : `+${formatMoney(gain, currency)}`}
            </Text>
            {simulating ? <ActivityIndicator color="#FFFFFF" /> : null}
          </View>
          <View style={styles.heroMeta}>
            <View style={styles.heroBadge}>
              <MaterialCommunityIcons color="#FFFFFF" name="calendar-range" size={14} />
              <Text style={styles.heroBadgeText}>
                {pending ? "…" : `${formatMoney(result?.annual_saving ?? 0, currency)} par an`}
              </Text>
            </View>
            {rate !== null ? (
              <View style={styles.heroBadge}>
                <MaterialCommunityIcons color="#FFFFFF" name="piggy-bank-outline" size={14} />
                <Text style={styles.heroBadgeText}>
                  Taux d'épargne : {Math.round(rate * 100)} %
                </Text>
              </View>
            ) : null}
          </View>
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
          ) : loadError ? (
            <View style={styles.card}>
              <Text style={styles.errorText}>{loadError}</Text>
              <Pressable onPress={() => void load()} style={styles.retry}>
                <Text style={styles.retryText}>Réessayer</Text>
              </Pressable>
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
                thumbTintColor={colors.primary}
              />
              <View style={styles.sliderRange}>
                <Text style={styles.sliderRangeText}>0%</Text>
                <Text style={styles.sliderRangeText}>50%</Text>
              </View>

              <View style={styles.divider} />

              {simError ? <Text style={styles.errorText}>{simError}</Text> : null}
              <View style={styles.resultRow}>
                <ResultCell
                  label="Dépense de référence"
                  sub={
                    result
                      ? result.reference_basis === "habituel"
                        ? "moyenne des mois précédents"
                        : "dépenses de ce mois"
                      : undefined
                  }
                  value={result ? `${formatMoney(result.reference_amount, currency)}/mois` : "…"}
                />
                <ResultCell
                  label="Nouvelle cible"
                  value={result ? `${formatMoney(result.new_target, currency)}/mois` : "…"}
                />
              </View>
              <View style={[styles.resultRow, styles.resultRowLast]}>
                <ResultCell
                  label="Économie mensuelle"
                  value={result ? formatMoney(result.monthly_saving, currency) : "…"}
                />
                <ResultCell
                  label="Économie annuelle"
                  value={result ? formatMoney(result.annual_saving, currency) : "…"}
                />
              </View>
            </View>
          )}
        </View>

        {/* Recommandation */}
        {recommendation ? (
          <View style={styles.reco}>
            <Text style={styles.recoEyebrow}>Recommandation pour cette catégorie</Text>
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
            {decideError ? <Text style={styles.errorText}>{decideError}</Text> : null}
            <View style={styles.recoBtns}>
              <Pressable
                disabled={deciding || recommendation.status === "REJECTED"}
                style={[
                  styles.btnIgnore,
                  (deciding || recommendation.status === "REJECTED") && { opacity: 0.6 },
                ]}
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

const ResultCell = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <View style={styles.resultCell}>
    <Text style={styles.resultLabel}>{label}</Text>
    <Text style={styles.resultValue}>{value}</Text>
    {sub ? <Text style={styles.resultSub}>{sub}</Text> : null}
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
    bottom: -32,
    height: 96,
    left: -32,
    position: "absolute",
    width: 96,
  },
  heroLabel: {
    color: "rgba(255,255,255,0.80)",
    fontSize: 13,
    fontFamily: interFonts.medium,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  heroAmount: { color: "#FFFFFF", fontSize: 37, fontFamily: interFonts.bold, letterSpacing: -1.5, lineHeight: 44, flexShrink: 1 },
  heroBadge: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroBadgeText: { color: "#FFFFFF", fontSize: 11, fontFamily: interFonts.semibold },
  heroMeta: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  errorText: { color: colors.danger, fontSize: 12, fontFamily: interFonts.semibold, marginBottom: 8 },
  retry: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: { color: "#FFFFFF", fontSize: 12, fontFamily: interFonts.bold },

  section: { gap: 4, marginTop: 28 },
  sectionTitle: { color: colors.text, fontSize: 18, fontFamily: interFonts.semibold, paddingHorizontal: 16 },
  sectionDesc: { color: colors.textMuted, fontSize: 15, fontFamily: interFonts.regular, lineHeight: 22, paddingHorizontal: 16 },

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
  chipText: { color: colors.text, fontSize: 12, fontFamily: interFonts.medium },
  chipTextActive: { color: "#FFFFFF" },

  sliderHead: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  sliderLabel: { alignItems: "center", flexDirection: "row", gap: 8 },
  sliderLabelText: { color: colors.text, fontSize: 13, fontFamily: interFonts.medium },
  sliderVal: { color: colors.primary, fontSize: 18, fontFamily: interFonts.semibold },
  slider: { height: 32, marginHorizontal: -8 },
  sliderRange: { flexDirection: "row", justifyContent: "space-between" },
  sliderRangeText: { color: colors.textMuted, fontSize: 11, fontFamily: interFonts.semibold },
  divider: { backgroundColor: colors.border, height: 1, marginVertical: 12 },

  resultRow: { flexDirection: "row", gap: 12 },
  resultRowLast: { marginTop: 12 },
  resultCell: { flex: 1, gap: 2 },
  resultLabel: { color: colors.textMuted, fontSize: 11, fontFamily: interFonts.semibold },
  resultValue: { color: colors.text, fontSize: 15, fontFamily: interFonts.bold },
  resultSub: { color: colors.textMuted, fontSize: 10, fontFamily: interFonts.regular },

  reco: {
    backgroundColor: "#DCE9FF",
    borderRadius: 16,
    gap: 16,
    marginHorizontal: 16,
    marginTop: 20,
    padding: 16,
  },
  recoEyebrow: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: interFonts.bold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
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
  recoTitle: { color: colors.text, fontSize: 18, fontFamily: interFonts.semibold },
  recoDesc: { color: colors.textMuted, fontSize: 15, fontFamily: interFonts.regular, lineHeight: 22 },
  recoImpact: { color: colors.primary, fontSize: 13, fontFamily: interFonts.bold },
  recoBtns: { flexDirection: "row", gap: 12 },
  btnIgnore: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnIgnoreText: { color: colors.primary, fontSize: 13, fontFamily: interFonts.medium },
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
  btnApplyText: { color: "#FFFFFF", fontSize: 13, fontFamily: interFonts.medium },
});
