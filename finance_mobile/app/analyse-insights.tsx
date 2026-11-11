import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { BackButton, Card, Pill, SectionTitle } from "../src/ui/components";
import { analytics as analyticsApi } from "../src/shared/api/analytics";
import { budget as budgetApi } from "../src/shared/api/budget";
import { whatIf as whatIfApi } from "../src/shared/api/whatIf";
import { ai as aiApi } from "../src/shared/api/ai";
import { useAppStore } from "../src/shared/store";
import type { AIAnalysisStored, CategoryAnalytics, Recommendation, WhatIfResult } from "../src/shared/types";
import { formatMoney } from "../src/shared/utils/money";
import { colors } from "../src/ui/theme";
import { capitalize } from "../src/shared/utils/format";
import { summarizeSeason, type SeasonalitySummary } from "../src/shared/utils/seasonality";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

/* ------------------------------------------------------------------ */
//  Helpers
/* ------------------------------------------------------------------ */

const CATEGORY_ICONS: Record<string, IconName> = {
  Alimentation: "cart-outline",
  "Logement & Charges": "home-outline",
  Transports: "car-outline",
  Santé: "medical-bag",
  Loisirs: "movie-open-outline",
  Abonnements: "wifi",
  Shopping: "shopping-outline",
  Éducation: "school-outline",
  Épargne: "piggy-bank-outline",
  Impôts: "cash-multiple",
  Autres: "credit-card-outline",
};

const categoryIcon = (name: string) =>
  CATEGORY_ICONS[name] ?? "credit-card-outline";

const toneFromScore = (score: number) =>
  score >= 0.6 ? colors.warning : colors.success;

/* ------------------------------------------------------------------ */
//  Sous-composants
/* ------------------------------------------------------------------ */

interface AiCardProps {
  summary: string;
}

function AiSummaryCard({ summary }: AiCardProps) {
  return (
    <Card style={aiStyles.card}>
      <View style={aiStyles.header}>
        <View style={aiStyles.icon}>
          <MaterialCommunityIcons color="#FFFFFF" name="brain" size={22} />
        </View>
        <View style={aiStyles.copy}>
          <Text style={aiStyles.label}>Analyse IA</Text>
          <Pill label="GEMMA 4" tone="neutral" />
        </View>
      </View>

      <Text style={aiStyles.summary}>{summary}</Text>

      <Pressable
        style={aiStyles.button}
        onPress={() => router.push("/analyse-detail")}
      >
        <Text style={aiStyles.buttonText}>Voir l'analyse complète</Text>
        <MaterialCommunityIcons
          color={colors.primary}
          name="arrow-right"
          size={18}
        />
      </Pressable>
    </Card>
  );
}

const aiStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primarySoft,
    gap: 12,
    marginTop: 24,
  },
  header: { alignItems: "center", flexDirection: "row", gap: 12 },
  icon: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 16,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  copy: { flex: 1, gap: 4 },
  label: { color: colors.primary, fontSize: 15, fontWeight: "800" },
  summary: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 14,
    paddingVertical: 12,
  },
  buttonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
});

// ─────────────────────────────────────────────────────────

interface DriftCardProps {
  cat: CategoryAnalytics;
  currency: string;
}

function DriftCategoryCard({ cat, currency }: DriftCardProps) {
  const tone = toneFromScore(cat.opportunity_score);
  return (
    <Card style={driftStyles.card}>
      <View style={driftStyles.row}>
        <View
          style={[
            driftStyles.icon,
            { backgroundColor: `${tone}18` },
          ]}
        >
          <MaterialCommunityIcons
            color={tone}
            name={categoryIcon(cat.name)}
            size={22}
          />
        </View>

        <View style={driftStyles.copy}>
          <View style={driftStyles.titleRow}>
            <Text style={driftStyles.name}>{cat.name}</Text>
            <Pill
              label={cat.variation_percentage >= 0 ? `+${Math.round(cat.variation_percentage)}%` : `${Math.round(cat.variation_percentage)}%`}
              tone={cat.variation_percentage >= 0 ? "warning" : "success"}
            />
          </View>

          <View style={driftStyles.amounts}>
            <Text style={driftStyles.current}>{formatMoney(cat.current_amount, currency)}</Text>
            <Text style={driftStyles.sep}>·</Text>
            <Text style={driftStyles.baseline}>moy. {formatMoney(cat.baseline_amount, currency)}</Text>
          </View>

          <View style={driftStyles.scoreRail}>
            <View
              style={[
                driftStyles.scoreFill,
                {
                  backgroundColor: tone,
                  width: `${Math.min(cat.opportunity_score * 100, 100)}%`,
                },
              ]}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}

const driftStyles = StyleSheet.create({
  card: { gap: 10, padding: 15 },
  row: { alignItems: "center", flexDirection: "row", gap: 12 },
  icon: {
    alignItems: "center",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  copy: { flex: 1, gap: 7 },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  name: { color: colors.text, fontSize: 15, fontWeight: "800" },
  amounts: { alignItems: "center", flexDirection: "row", gap: 6 },
  current: { color: colors.text, fontSize: 13, fontWeight: "700" },
  sep: { color: colors.textMuted, fontSize: 10 },
  baseline: { color: colors.textMuted, fontSize: 12 },
  scoreRail: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 4,
    height: 6,
    overflow: "hidden",
  },
  scoreFill: { borderRadius: 4, height: "100%" },
});

// ─────────────────────────────────────────────────────────

const SIM_PERCENTS = [10, 20, 30, 50] as const;

interface WhatIfCardProps {
  candidates: CategoryAnalytics[];
  categoryId: string | null;
  percent: number;
  result: WhatIfResult | null;
  loading: boolean;
  currency: string;
  onCategory: (id: string) => void;
  onPercent: (percent: number) => void;
}

/** Simulateur rapide : une catégorie, un effort de réduction, l'effet avant / après. */
function WhatIfCard({
  candidates,
  categoryId,
  percent,
  result,
  loading,
  currency,
  onCategory,
  onPercent,
}: WhatIfCardProps) {
  if (candidates.length === 0) {
    return (
      <Card style={whatIfStyles.card}>
        <Text style={whatIfStyles.title}>Simulateur indisponible</Text>
        <Text style={whatIfStyles.subtitle}>Ajoutez des dépenses pour activer la simulation.</Text>
      </Card>
    );
  }

  const before = result?.reference_amount ?? 0;
  const after = result?.new_target ?? 0;
  const scale = Math.max(before, 1);

  return (
    <View style={whatIfStyles.card}>
      <View pointerEvents="none" style={[whatIfStyles.orb, whatIfStyles.orbLarge]} />
      <View pointerEvents="none" style={[whatIfStyles.orb, whatIfStyles.orbSmall]} />

      <Text style={whatIfStyles.title}>Et si vous réduisiez ?</Text>
      <Text style={whatIfStyles.subtitle}>Choisissez une catégorie et l'effort à fournir.</Text>

      <View style={whatIfStyles.chips}>
        {candidates.map((c) => {
          const active = c.category_id === categoryId;
          return (
            <Pressable
              key={c.category_id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onCategory(c.category_id)}
              style={[whatIfStyles.chip, active && whatIfStyles.chipActive]}
            >
              <MaterialCommunityIcons
                color={active ? "#FFFFFF" : colors.primary}
                name={categoryIcon(c.name)}
                size={14}
              />
              <Text style={[whatIfStyles.chipText, active && whatIfStyles.chipTextActive]}>{c.name}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={whatIfStyles.segment}>
        {SIM_PERCENTS.map((pct) => {
          const active = pct === percent;
          return (
            <Pressable
              key={pct}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onPercent(pct)}
              style={[whatIfStyles.segmentBtn, active && whatIfStyles.segmentBtnActive]}
            >
              <Text style={[whatIfStyles.segmentText, active && whatIfStyles.segmentTextActive]}>
                −{pct} %
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={whatIfStyles.compare}>
        <View style={whatIfStyles.compareRow}>
          <Text style={whatIfStyles.compareLabel}>Aujourd'hui</Text>
          <View style={whatIfStyles.track}>
            <View style={[whatIfStyles.fillBefore, { width: result ? "100%" : "0%" }]} />
          </View>
          <Text style={whatIfStyles.compareValue}>{result ? formatMoney(before, currency) : "…"}</Text>
        </View>
        <View style={whatIfStyles.compareRow}>
          <Text style={whatIfStyles.compareLabel}>Avec −{percent} %</Text>
          <View style={whatIfStyles.track}>
            <View style={[whatIfStyles.fillAfter, { width: `${(after / scale) * 100}%` }]} />
          </View>
          <Text style={[whatIfStyles.compareValue, { color: colors.primary }]}>
            {result ? formatMoney(after, currency) : "…"}
          </Text>
        </View>
        {result ? (
          <Text style={whatIfStyles.basis}>
            Base : {result.reference_basis === "habituel" ? "votre dépense habituelle" : "vos dépenses de ce mois"}
          </Text>
        ) : null}
      </View>

      <View style={whatIfStyles.gainBox}>
        {loading && !result ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Text style={whatIfStyles.gainLabel}>Vous gagneriez</Text>
            <Text style={whatIfStyles.gain}>
              {formatMoney(result?.monthly_saving ?? 0, currency)}
              <Text style={whatIfStyles.gainPer}> /mois</Text>
            </Text>
            <Text style={whatIfStyles.gainSub}>
              soit {formatMoney(result?.annual_saving ?? 0, currency)} sur un an
              {result?.projected_savings_rate != null
                ? ` · taux d'épargne ${Math.round(result.projected_savings_rate * 100)} %`
                : ""}
            </Text>
          </>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/simulation")}
        style={({ pressed }) => [whatIfStyles.button, pressed && { opacity: 0.85 }]}
      >
        <Text style={whatIfStyles.buttonText}>Ouvrir le simulateur complet</Text>
        <MaterialCommunityIcons color={colors.primary} name="arrow-right" size={16} />
      </Pressable>
    </View>
  );
}

const whatIfStyles = StyleSheet.create({
  card: {
    backgroundColor: "#F6F4FF",
    borderColor: `${colors.primary}22`,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    marginTop: 12,
    overflow: "hidden",
    padding: 16,
    position: "relative",
  },
  orb: { borderRadius: 999, position: "absolute" },
  orbLarge: {
    backgroundColor: `${colors.primary}14`,
    height: 140,
    right: -50,
    top: -60,
    width: 140,
  },
  orbSmall: {
    backgroundColor: `${colors.primary}0D`,
    bottom: -30,
    height: 80,
    left: -26,
    width: 80,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: -8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: `${colors.primary}22`,
    borderRadius: 99,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#FFFFFF" },
  segment: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    flexDirection: "row",
    padding: 3,
  },
  segmentBtn: { alignItems: "center", borderRadius: 9, flex: 1, paddingVertical: 8 },
  segmentBtnActive: { backgroundColor: colors.primarySoft },
  segmentText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  segmentTextActive: { color: colors.primary },
  compare: { gap: 8 },
  compareRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  compareLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600", width: 78 },
  track: {
    backgroundColor: `${colors.primary}12`,
    borderRadius: 99,
    flex: 1,
    height: 8,
    overflow: "hidden",
  },
  fillBefore: { backgroundColor: "#B9B3DE", borderRadius: 99, height: 8 },
  fillAfter: { backgroundColor: colors.primary, borderRadius: 99, height: 8 },
  compareValue: { color: colors.text, fontSize: 12, fontWeight: "800", minWidth: 76, textAlign: "right" },
  basis: { color: colors.textMuted, fontSize: 11 },
  gainBox: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    minHeight: 76,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  gainLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
  gain: { color: colors.success, fontSize: 24, fontWeight: "800" },
  gainPer: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  gainSub: { color: colors.textMuted, fontSize: 12 },
  button: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
    paddingVertical: 4,
  },
  buttonText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
});

// ─────────────────────────────────────────────────────────

const DONE_LABEL: Partial<Record<Recommendation["status"], string>> = {
  ACCEPTED: "Appliquée",
  REJECTED: "Ignorée",
  ADJUSTED: "Ajustée",
};

/** Recommandations du mois en cartes à faire glisser (même esprit que « Vigilance budgétaire »). */
function RecommendationCarousel({
  items,
  cats,
  currency,
  decidingId,
  onApply,
}: {
  items: Recommendation[];
  cats: CategoryAnalytics[];
  currency: string;
  decidingId: string | null;
  onApply: (reco: Recommendation) => void;
}) {
  return (
    <ScrollView
      horizontal
      contentContainerStyle={recoStyles.scroll}
      showsHorizontalScrollIndicator={false}
      style={recoStyles.scroller}
    >
      {items.map((reco) => {
        const cat = cats.find((c) => c.category_id === reco.category_id) ?? null;
        const done = DONE_LABEL[reco.status];
        const busy = decidingId === reco.id;
        const variation = cat?.variation_percentage ?? null;
        const up = variation !== null && variation > 0;
        return (
          <View key={reco.id} style={[recoStyles.card, done && recoStyles.cardDone]}>
            <View pointerEvents="none" style={[recoStyles.orb, recoStyles.orbSmall]} />
            <View pointerEvents="none" style={[recoStyles.orb, recoStyles.orbLarge]} />

            <View style={recoStyles.top}>
              <View style={recoStyles.icon}>
                <MaterialCommunityIcons
                  color={colors.primary}
                  name={categoryIcon(reco.category_name)}
                  size={20}
                />
              </View>
              {variation !== null && Math.round(variation) !== 0 ? (
                <View style={[recoStyles.trend, { backgroundColor: up ? "#FBE9E7" : colors.successSoft }]}>
                  <MaterialCommunityIcons
                    color={up ? colors.danger : colors.success}
                    name={up ? "arrow-up" : "arrow-down"}
                    size={12}
                  />
                  <Text style={[recoStyles.trendText, { color: up ? colors.danger : colors.success }]}>
                    {Math.abs(Math.round(variation))} %
                  </Text>
                </View>
              ) : null}
            </View>

            <Text numberOfLines={1} style={recoStyles.name}>
              {reco.category_name}
            </Text>
            {cat ? (
              <Text numberOfLines={2} style={recoStyles.context}>
                {formatMoney(cat.current_amount, currency)} ce mois, pour{" "}
                {formatMoney(cat.baseline_amount, currency)} d'habitude
              </Text>
            ) : null}

            <View style={recoStyles.gainBox}>
              <Text style={recoStyles.gainLabel}>À gagner</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={recoStyles.gain}>
                {formatMoney(reco.impact_estimated, currency)}
                <Text style={recoStyles.gainPer}> /mois</Text>
              </Text>
              <Text style={recoStyles.year}>
                soit {formatMoney(reco.impact_estimated * 12, currency)} sur un an
              </Text>
            </View>

            {done ? (
              <View style={recoStyles.done}>
                <MaterialCommunityIcons
                  color={reco.status === "ACCEPTED" ? colors.success : colors.textMuted}
                  name={reco.status === "ACCEPTED" ? "check-circle" : "minus-circle-outline"}
                  size={16}
                />
                <Text
                  style={[
                    recoStyles.doneText,
                    reco.status === "ACCEPTED" && { color: colors.success },
                  ]}
                >
                  {done}
                </Text>
              </View>
            ) : (
              <Pressable
                accessibilityLabel={`Appliquer la recommandation ${reco.category_name}`}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => onApply(reco)}
                style={({ pressed }) => [recoStyles.btn, (pressed || busy) && recoStyles.btnDim]}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={recoStyles.btnText}>Appliquer</Text>
                )}
              </Pressable>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const recoStyles = StyleSheet.create({
  scroller: { marginHorizontal: -20 },
  scroll: { gap: 12, paddingHorizontal: 20 },
  card: {
    backgroundColor: "#F6F4FF",
    borderColor: `${colors.primary}22`,
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
    overflow: "hidden",
    padding: 14,
    position: "relative",
    width: 210,
  },
  cardDone: { backgroundColor: colors.surface, borderColor: colors.border },
  orb: { borderRadius: 999, position: "absolute" },
  orbSmall: {
    backgroundColor: `${colors.primary}10`,
    bottom: 60,
    height: 40,
    left: -16,
    width: 40,
  },
  orbLarge: {
    backgroundColor: `${colors.primary}14`,
    height: 110,
    right: -40,
    top: -46,
    width: 110,
  },
  top: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  icon: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 99,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  trend: {
    alignItems: "center",
    borderRadius: 99,
    flexDirection: "row",
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  trendText: { fontSize: 12, fontWeight: "700" },
  name: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 8 },
  context: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  gainBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  gainLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
  gain: { color: colors.success, fontSize: 20, fontWeight: "800" },
  gainPer: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  year: { color: colors.textMuted, fontSize: 11 },
  btn: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 38,
  },
  btnDim: { opacity: 0.7 },
  btnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  done: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 38,
  },
  doneText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
});

// ─────────────────────────────────────────────────────────

function AnalysisHistoryRow({ analysis }: { analysis: AIAnalysisStored }) {
  return (
    <View style={histStyles.card}>
      <View style={histStyles.dot} />
      <View style={histStyles.copy}>
        <Text style={histStyles.title}>{monthLabel(analysis.period)}</Text>
        <Text style={histStyles.summary} numberOfLines={2}>
          {analysis.summary}
        </Text>
      </View>
    </View>
  );
}

const histStyles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  dot: {
    backgroundColor: colors.primarySoft,
    borderRadius: 6,
    height: 10,
    width: 10,
  },
  copy: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 14, fontWeight: "700" },
  summary: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
});

// ═══════════════════════════════════════════════════════════
//  TENDANCE SAISONNIÈRE (12 derniers mois)
// ═══════════════════════════════════════════════════════════

const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

const signedPct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))} %`;

const shortMonthLabel = (p: string) =>
  new Date(`${p}-01T12:00:00`).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });

function SeasonalityCard({
  summary,
  period,
  currency,
}: {
  summary: SeasonalitySummary | null;
  period: string;
  currency: string;
}) {
  if (!summary) {
    return (
      <Card style={seasonStyles.card}>
        <Text style={seasonStyles.subtitle}>Historique mensuel indisponible pour le moment.</Text>
      </Card>
    );
  }

  const { months, average, projectedCurrent, partial } = summary;
  const max = Math.max(...months.map((m) => m.total), projectedCurrent, average ?? 0, 1);
  const monthName = monthLabel(period).split(" ")[0].toLowerCase();

  let message: string;
  if (!summary.enough) {
    message = `Encore trop peu d'historique (${summary.historyMonths} mois avec des dépenses). La tendance apparaîtra après 3 mois.`;
  } else if (summary.lastYear && summary.vsLastYear !== null) {
    message = `En ${monthName} l'an dernier, vous aviez dépensé ${formatMoney(summary.lastYear.total, currency)}. Ce mois-ci, vous êtes ${partial ? "parti pour" : "à"} ${formatMoney(projectedCurrent, currency)} (${signedPct(summary.vsLastYear)}).`;
  } else if (summary.vsAverage !== null) {
    const above = summary.vsAverage >= 0;
    message = `Ce mois-ci, vos dépenses ${partial ? "projetées " : ""}sont ${Math.abs(Math.round(summary.vsAverage * 100))} % ${above ? "au-dessus" : "en dessous"} de votre moyenne mensuelle.`;
  } else {
    message = "Pas encore de comparaison possible.";
  }

  return (
    <Card style={seasonStyles.card}>
      <Text style={seasonStyles.subtitle}>{message}</Text>

      <View style={seasonStyles.chart}>
        {average ? (
          <View
            pointerEvents="none"
            style={[seasonStyles.avgLine, { bottom: `${(average / max) * 100}%` }]}
          />
        ) : null}
        {months.map((m) => {
          const isCurrent = m.period === period;
          const value = isCurrent ? projectedCurrent : m.total;
          const realPart = isCurrent && value > 0 ? m.total / value : 1;
          return (
            <View key={m.period} style={seasonStyles.col}>
              <View
                style={[
                  seasonStyles.bar,
                  { height: `${Math.max((value / max) * 100, value > 0 ? 3 : 0)}%` },
                  isCurrent && seasonStyles.barProjected,
                ]}
              >
                {isCurrent ? (
                  <View style={[seasonStyles.barReal, { height: `${realPart * 100}%` }]} />
                ) : null}
              </View>
              <Text style={[seasonStyles.colLabel, isCurrent && seasonStyles.colLabelActive]}>
                {MONTH_INITIALS[Number(m.period.slice(5, 7)) - 1]}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={seasonStyles.legend}>
        <View style={seasonStyles.legendItem}>
          <View style={[seasonStyles.legendSwatch, { backgroundColor: colors.primary }]} />
          <Text style={seasonStyles.legendText}>Ce mois</Text>
        </View>
        {partial ? (
          <View style={seasonStyles.legendItem}>
            <View style={[seasonStyles.legendSwatch, { backgroundColor: `${colors.primary}40` }]} />
            <Text style={seasonStyles.legendText}>Projection fin de mois</Text>
          </View>
        ) : null}
        {average ? (
          <View style={seasonStyles.legendItem}>
            <View style={seasonStyles.legendDash} />
            <Text style={seasonStyles.legendText}>Moyenne</Text>
          </View>
        ) : null}
      </View>

      <View style={seasonStyles.metrics}>
        <View style={seasonStyles.metric}>
          <Text style={seasonStyles.metricValue}>{average ? formatMoney(average, currency) : "—"}</Text>
          <Text style={seasonStyles.metricLabel}>Moyenne / mois</Text>
        </View>
        <View style={seasonStyles.metric}>
          <Text
            style={[
              seasonStyles.metricValue,
              summary.vsAverage !== null && {
                color: summary.vsAverage > 0.05 ? colors.danger : colors.success,
              },
            ]}
          >
            {summary.vsAverage !== null ? signedPct(summary.vsAverage) : "—"}
          </Text>
          <Text style={seasonStyles.metricLabel}>Ce mois vs moyenne</Text>
        </View>
        <View style={seasonStyles.metric}>
          <Text style={seasonStyles.metricValue}>
            {summary.peak ? shortMonthLabel(summary.peak.period) : "—"}
          </Text>
          <Text style={seasonStyles.metricLabel}>Mois le plus élevé</Text>
        </View>
      </View>
    </Card>
  );
}

const seasonStyles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    marginTop: 12,
    padding: 18,
  },
  subtitle: { color: colors.text, fontSize: 13, lineHeight: 20 },
  chart: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 4,
    height: 110,
    paddingBottom: 16,
    position: "relative",
  },
  avgLine: {
    borderColor: colors.textMuted,
    borderStyle: "dashed",
    borderTopWidth: 1,
    left: 0,
    marginBottom: 16,
    opacity: 0.6,
    position: "absolute",
    right: 0,
  },
  col: { alignItems: "center", flex: 1, height: "100%", justifyContent: "flex-end" },
  bar: {
    backgroundColor: "#DCDDF0",
    borderRadius: 4,
    justifyContent: "flex-end",
    overflow: "hidden",
    width: "100%",
  },
  barProjected: { backgroundColor: `${colors.primary}40` },
  barReal: { backgroundColor: colors.primary, width: "100%" },
  colLabel: { bottom: -16, color: colors.textMuted, fontSize: 10, position: "absolute" },
  colLabelActive: { color: colors.primary, fontWeight: "800" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 5 },
  legendSwatch: { borderRadius: 3, height: 10, width: 10 },
  legendDash: {
    borderColor: colors.textMuted,
    borderStyle: "dashed",
    borderTopWidth: 1,
    width: 14,
  },
  legendText: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
  metrics: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 14,
  },
  metric: { alignItems: "center", flex: 1, gap: 4 },
  metricValue: { color: colors.text, fontSize: 14, fontWeight: "800" },
  metricLabel: { color: colors.textMuted, fontSize: 11, textAlign: "center" },
});

// ═══════════════════════════════════════════════════════════
//  COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════

/** Catégories proposées dans le simulateur rapide : les 4 avec le plus de marge. */
function simCandidates(cats: CategoryAnalytics[]): CategoryAnalytics[] {
  return cats
    .filter((c) => c.current_amount > 0 || c.baseline_amount > 0)
    .sort((a, b) => b.opportunity_score - a.opportunity_score)
    .slice(0, 4);
}

const monthLabel = (iso: string) =>
  capitalize(new Date(`${iso}-01`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));

export default function Insights() {
  const userId = useAppStore((s) => s.userId);
  const currency = useAppStore((s) => s.currency);
  const period = useAppStore((s) => s.currentPeriod);

  const [loading, setLoading] = useState(true);
  const [driftCats, setDriftCats] = useState<CategoryAnalytics[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResult | null>(null);
  const [simCatId, setSimCatId] = useState<string | null>(null);
  const [simPercent, setSimPercent] = useState(20);
  const [simLoading, setSimLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string>(
    "Analyse IA en cours de chargement…"
  );
  const [history, setHistory] = useState<AIAnalysisStored[]>([]);
  const [season, setSeason] = useState<SeasonalitySummary | null>(null);
  const [allCats, setAllCats] = useState<CategoryAnalytics[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);

  const decide = useCallback(
    async (reco: Recommendation, status: "ACCEPTED" | "REJECTED") => {
      if (!userId) return;
      setDecidingId(reco.id);
      setDecideError(null);
      try {
        const updated = await budgetApi.updateRecommendationStatus(userId, reco.id, status);
        setRecommendations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      } catch {
        setDecideError("Impossible d'enregistrer votre choix. Réessayez.");
      } finally {
        setDecidingId(null);
      }
    },
    [userId],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          if (!userId) return;
          const [catsRes, recos, stored, monthly] = await Promise.all([
            analyticsApi.categories(userId, period),
            budgetApi.listRecommendations(userId, period).catch(() => ({ items: [] as Recommendation[] })),
            aiApi.listAnalyses(userId, { limit: 10 }).catch(() => ({ items: [] as AIAnalysisStored[] })),
            analyticsApi.monthly(userId, period, 12).catch(() => null),
          ]);

          if (cancelled) return;
          setDriftCats(catsRes.filter((c) => Math.abs(c.variation_percentage) > 5));
          setSeason(monthly ? summarizeSeason(monthly, period, new Date()) : null);
          setAllCats(catsRes);
          /* À décider d'abord, puis par économie décroissante. */
          setRecommendations(
            [...recos.items].sort(
              (a, b) =>
                Number(b.status === "PROPOSED") - Number(a.status === "PROPOSED") ||
                b.impact_estimated - a.impact_estimated,
            ),
          );
          setHistory(stored.items);

          // La page s'affiche dès que les données de base sont là : la
          // simulation et l'analyse IA (lente) se chargent ensuite en arrière-plan.
          setLoading(false);

          setSimCatId((prev) =>
            prev && catsRes.some((c) => c.category_id === prev)
              ? prev
              : (simCandidates(catsRes)[0]?.category_id ?? null),
          );

          await Promise.allSettled([
            (async () => {
              try {
                const aiRes = await aiApi.analyze(userId, period);
                if (!cancelled && aiRes?.summary) setAiSummary(aiRes.summary);
              } catch {
                if (!cancelled)
                  setAiSummary("Analyse IA indisponible pour ce mois-ci.");
              }
            })(),
          ]);
        } catch {
          // graceful fallback to empty
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [userId, period])
  );

  useEffect(() => {
    if (!userId || !simCatId) return;
    let cancelled = false;
    setSimLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await whatIfApi.simulate(userId, period, {
          category_id: simCatId,
          reduction_percent: simPercent,
        });
        if (!cancelled) setWhatIfResult(res);
      } catch {
        if (!cancelled) setWhatIfResult(null);
      } finally {
        if (!cancelled) setSimLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId, period, simCatId, simPercent]);

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <BackButton size={24} />
            <View>
              <Text style={styles.eyebrow}>ANALYSE</Text>
              <Text style={styles.title}>Insights</Text>
            </View>
          </View>
          <View style={styles.periodButton}>
            <MaterialCommunityIcons
              color={colors.primary}
              name="calendar-month-outline"
              size={20}
            />
            <Text style={styles.periodText}>{monthLabel(period)}</Text>
          </View>
        </View>

        {/* ── Analyse IA ── */}
        <AiSummaryCard summary={aiSummary} />

        {/* ── Historique des analyses ── */}
        {history.length > 0 && (
          <>
            <SectionTitle title="Historique des analyses" />
            <View style={styles.listGap}>
              {history
                .filter((h) => h.period !== period)
                .map((h) => (
                  <AnalysisHistoryRow key={h.id} analysis={h} />
                ))}
            </View>
          </>
        )}

        {/* ── Catégories à surveiller ── */}
        <SectionTitle title="Catégories à surveiller" />
        <View style={styles.listGap}>
          {driftCats.length > 0 ? (
            driftCats.map((cat) => (
              <DriftCategoryCard key={cat.category_id} cat={cat} currency={currency} />
            ))
          ) : (
            <Text style={styles.emptyText}>Aucune dérive significative détectée ce mois-ci.</Text>
          )}
        </View>

        {/* ── Simulateur ── */}
        <SectionTitle title="Simulateur" />
        <WhatIfCard
          candidates={simCandidates(allCats)}
          categoryId={simCatId}
          currency={currency}
          loading={simLoading}
          onCategory={setSimCatId}
          onPercent={setSimPercent}
          percent={simPercent}
          result={
            whatIfResult &&
            whatIfResult.reduction_percent === simPercent &&
            whatIfResult.category_name ===
              allCats.find((c) => c.category_id === simCatId)?.name
              ? whatIfResult
              : null
          }
        />

        {/* ── Recommandations ── */}
        <SectionTitle title="Recommandations" />
        <View style={styles.listGap}>
          {decideError ? <Text style={styles.errorText}>{decideError}</Text> : null}
          {recommendations.length > 0 ? (
            <RecommendationCarousel
              cats={allCats}
              currency={currency}
              decidingId={decidingId}
              items={recommendations}
              onApply={(reco) => void decide(reco, "ACCEPTED")}
            />
          ) : (
            <Text style={styles.emptyText}>Aucune recommandation active pour {monthLabel(period)}.</Text>
          )}
        </View>

        {/* ── Tendance saisonnière ── */}
        <SectionTitle title="Tendance saisonnière" />
        <SeasonalityCard currency={currency} period={period} summary={season} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════
//  STYLES GLOBAUX
// ═══════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 32 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headerLeft: { alignItems: "center", flexDirection: "row", gap: 12 },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  title: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "800",
    marginTop: 4,
  },
  periodButton: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    flexDirection: "row",
    gap: 6,
    height: 43,
    paddingHorizontal: 14,
  },
  periodText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  listGap: { gap: 10 },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 16,
  },
  loadingWrap: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
});
