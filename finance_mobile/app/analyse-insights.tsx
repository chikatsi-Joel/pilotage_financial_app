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
import { colors, interFonts } from "../src/ui/theme";
import { EffortSlider } from "../src/ui/scenarioCharts";
import { capitalize } from "../src/shared/utils/format";
import { seasonPhrase, summarizeSeason, type SeasonalitySummary } from "../src/shared/utils/seasonality";
import { SeasonChart } from "../src/ui/SeasonChart";

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
  label: { color: colors.primary, fontSize: 14, fontFamily: interFonts.bold },
  summary: {
    color: colors.textMuted,
    fontSize: 12, fontFamily: interFonts.regular,
    lineHeight: 18,
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
    fontSize: 12,
    fontFamily: interFonts.bold,
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
  name: { color: colors.text, fontSize: 14, fontFamily: interFonts.bold },
  amounts: { alignItems: "center", flexDirection: "row", gap: 6 },
  current: { color: colors.text, fontSize: 12, fontFamily: interFonts.bold },
  sep: { color: colors.textMuted, fontSize: 9, fontFamily: interFonts.regular },
  baseline: { color: colors.textMuted, fontSize: 11, fontFamily: interFonts.regular },
  scoreRail: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 4,
    height: 6,
    overflow: "hidden",
  },
  scoreFill: { borderRadius: 4, height: "100%" },
});

// ─────────────────────────────────────────────────────────

const SIM_MAX = 60;

interface WhatIfCardProps {
  candidates: CategoryAnalytics[];
  categoryId: string | null;
  percent: number;
  /** Dernière simulation pour la catégorie choisie (l'effort peut différer du curseur). */
  result: WhatIfResult | null;
  loading: boolean;
  currency: string;
  onCategory: (id: string) => void;
  onPercent: (percent: number) => void;
}

/**
 * Simulateur rapide écrit comme une phrase : « Si je dépense 20 % de moins en Alimentation,
 * je garde 30 000 XAF chaque mois. » La catégorie se change en touchant son nom, l'effort au
 * curseur. Les montants sont calculés en direct sur la dépense de référence du serveur.
 */
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
  const [picking, setPicking] = useState(false);

  if (candidates.length === 0) {
    return (
      <Card style={whatIfStyles.card}>
        <Text style={whatIfStyles.sentence}>Ajoutez des dépenses pour essayer le simulateur.</Text>
      </Card>
    );
  }

  const category = candidates.find((c) => c.category_id === categoryId) ?? candidates[0];
  const before = result?.reference_amount ?? 0;
  const saving = (before * percent) / 100;
  const rate = result && result.reduction_percent === percent ? result.projected_savings_rate : null;

  return (
    <View style={whatIfStyles.card}>
      <View pointerEvents="none" style={[whatIfStyles.orb, whatIfStyles.orbLarge]} />
      <View pointerEvents="none" style={[whatIfStyles.orb, whatIfStyles.orbSmall]} />

      <Text style={whatIfStyles.sentence}>
        Si je dépense <Text style={whatIfStyles.token}>{percent} %</Text> de moins en{" "}
        <Text
          accessibilityRole="button"
          onPress={() => setPicking((v) => !v)}
          style={[whatIfStyles.token, whatIfStyles.tokenTap]}
        >
          {category.name} {picking ? "▴" : "▾"}
        </Text>
        , je garde
      </Text>

      {picking ? (
        <View style={whatIfStyles.chips}>
          {candidates.map((c) => {
            const active = c.category_id === category.category_id;
            return (
              <Pressable
                key={c.category_id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  onCategory(c.category_id);
                  setPicking(false);
                }}
                style={[whatIfStyles.chip, active && whatIfStyles.chipActive]}
              >
                <MaterialCommunityIcons
                  color={active ? "#FFFFFF" : colors.primary}
                  name={categoryIcon(c.name)}
                  size={13}
                />
                <Text style={[whatIfStyles.chipText, active && whatIfStyles.chipTextActive]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={whatIfStyles.gainBlock}>
        {loading && !result ? (
          <ActivityIndicator color={colors.primary} style={{ alignSelf: "flex-start" }} />
        ) : (
          <>
            <Text adjustsFontSizeToFit numberOfLines={1} style={whatIfStyles.gain}>
              {formatMoney(saving, currency)}
            </Text>
            <Text style={whatIfStyles.gainPer}>chaque mois</Text>
          </>
        )}
      </View>

      <EffortSlider
        label={`Effort sur ${category.name}`}
        max={SIM_MAX}
        onChange={onPercent}
        value={percent}
      />

      <View style={whatIfStyles.footer}>
        <Text style={whatIfStyles.facts}>
          {result
            ? `${formatMoney(before, currency)} → ${formatMoney(before - saving, currency)} /mois · ${formatMoney(saving * 12, currency)} sur un an${
                rate != null ? ` · épargne ${Math.round(rate * 100)} %` : ""
              }`
            : "…"}
        </Text>
        {result ? (
          <Text style={whatIfStyles.basis}>
            Calculé sur {result.reference_basis === "habituel" ? "votre dépense habituelle" : "vos dépenses de ce mois"}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() =>
            router.push({ pathname: "/simulation", params: { category: category.category_id, percent: String(percent) } })
          }
          style={({ pressed }) => [whatIfStyles.link, pressed && { opacity: 0.7 }]}
        >
          <Text style={whatIfStyles.linkText}>Tout simuler</Text>
          <MaterialCommunityIcons color={colors.primary} name="arrow-right" size={15} />
        </Pressable>
      </View>
    </View>
  );
}

const whatIfStyles = StyleSheet.create({
  card: {
    backgroundColor: "#F6F4FF",
    borderColor: `${colors.primary}22`,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    marginTop: 12,
    overflow: "hidden",
    padding: 18,
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
  sentence: { color: colors.text, fontFamily: interFonts.medium, fontSize: 17, lineHeight: 27 },
  token: {
    color: colors.primary,
    fontFamily: interFonts.bold,
    textDecorationColor: `${colors.primary}66`,
    textDecorationLine: "underline",
  },
  tokenTap: { backgroundColor: `${colors.primary}12` },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
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
  chipText: { color: colors.text, fontSize: 11, fontFamily: interFonts.semibold },
  chipTextActive: { color: "#FFFFFF" },
  gainBlock: { minHeight: 58, justifyContent: "center", marginTop: -2 },
  gain: { color: colors.primary, fontFamily: interFonts.bold, fontSize: 34, letterSpacing: -1, lineHeight: 40 },
  gainPer: { color: colors.textMuted, fontFamily: interFonts.medium, fontSize: 12, marginTop: -2 },
  footer: { gap: 2 },
  facts: { color: colors.text, fontFamily: interFonts.semibold, fontSize: 11.5 },
  basis: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 10 },
  link: { alignItems: "center", alignSelf: "flex-end", flexDirection: "row", gap: 4, marginTop: 6 },
  linkText: { color: colors.primary, fontFamily: interFonts.bold, fontSize: 12.5 },
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
  trendText: { fontSize: 11, fontFamily: interFonts.bold },
  name: { color: colors.text, fontSize: 15, fontFamily: interFonts.bold, marginTop: 8 },
  context: { color: colors.textMuted, fontSize: 11, fontFamily: interFonts.regular, lineHeight: 16 },
  gainBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  gainLabel: { color: colors.textMuted, fontSize: 10, fontFamily: interFonts.semibold },
  gain: { color: colors.success, fontSize: 18, fontFamily: interFonts.bold },
  gainPer: { color: colors.textMuted, fontSize: 11, fontFamily: interFonts.semibold },
  year: { color: colors.textMuted, fontSize: 10, fontFamily: interFonts.regular },
  btn: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 38,
  },
  btnDim: { opacity: 0.7 },
  btnText: { color: "#FFFFFF", fontSize: 12, fontFamily: interFonts.bold },
  done: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 38,
  },
  doneText: { color: colors.textMuted, fontSize: 12, fontFamily: interFonts.bold },
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
  title: { color: colors.text, fontSize: 13, fontFamily: interFonts.bold },
  summary: { color: colors.textMuted, fontSize: 11, fontFamily: interFonts.regular, lineHeight: 16 },
});

// ═══════════════════════════════════════════════════════════
//  TENDANCE SAISONNIÈRE (12 derniers mois)
// ═══════════════════════════════════════════════════════════

const signedPct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))} %`;

/**
 * Tendance saisonnière : une phrase de synthèse, puis la série mensuelle des dépenses
 * en courbe (tendance, projection du mois en cours, lecture au doigt).
 */
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
        <Text style={seasonStyles.note}>Historique mensuel indisponible pour le moment.</Text>
      </Card>
    );
  }

  const { average, projectedCurrent, partial } = summary;

  let detail: string | null = null;
  if (summary.enough && summary.lastYear && summary.vsLastYear !== null) {
    detail = `Il y a un an : ${formatMoney(summary.lastYear.total, currency)}. Ce mois-ci, ${partial ? "vous êtes parti pour" : "vous êtes à"} ${formatMoney(projectedCurrent, currency)} (${signedPct(summary.vsLastYear)}).`;
  } else if (summary.enough && summary.vsAverage !== null) {
    detail = `Ce mois-ci, ${partial ? "vous êtes parti pour" : "vous êtes à"} ${formatMoney(projectedCurrent, currency)}, soit ${signedPct(summary.vsAverage)} par rapport à votre moyenne.`;
  }

  return (
    <View style={seasonStyles.card}>
      <View pointerEvents="none" style={seasonStyles.orb} />
      <Text style={seasonStyles.headline}>{seasonPhrase(summary, period)}</Text>
      {detail ? <Text style={seasonStyles.note}>{detail}</Text> : null}

      <SeasonChart
        average={average}
        currency={currency}
        months={summary.months}
        partial={partial}
        period={period}
        projectedCurrent={projectedCurrent}
      />
    </View>
  );
}

const seasonStyles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    marginTop: 12,
    overflow: "hidden",
    padding: 16,
    position: "relative",
  },
  orb: {
    backgroundColor: `${colors.primary}0D`,
    borderRadius: 999,
    height: 130,
    position: "absolute",
    right: -46,
    top: -56,
    width: 130,
  },
  headline: { color: colors.text, fontFamily: interFonts.bold, fontSize: 15, lineHeight: 21 },
  note: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 11.5, lineHeight: 17, marginTop: -4 },
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
    fontSize: 10,
    fontFamily: interFonts.bold,
    letterSpacing: 0.8,
  },
  title: {
    color: colors.text,
    fontSize: 23,
    fontFamily: interFonts.bold,
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
    fontSize: 12,
    fontFamily: interFonts.bold,
  },
  listGap: { gap: 10 },
  errorText: { color: colors.danger, fontSize: 12, fontFamily: interFonts.semibold },
  emptyText: {
    color: colors.textMuted,
    fontSize: 12, fontFamily: interFonts.regular,
    textAlign: "center",
    paddingVertical: 16,
  },
  loadingWrap: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
});
