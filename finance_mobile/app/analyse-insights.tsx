import { useCallback, useState } from "react";
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

interface WhatIfCardProps {
  result: WhatIfResult | null;
  currency: string;
}

function WhatIfCard({ result, currency }: WhatIfCardProps) {
  if (!result) {
    return (
      <Card style={whatIfStyles.card}>
        <Text style={whatIfStyles.title}>Simulateur indisponible</Text>
        <Text style={whatIfStyles.subtitle}>Ajoutez des catégories pour activer la simulation.</Text>
      </Card>
    );
  }

  return (
    <Card style={whatIfStyles.card}>
      <View style={whatIfStyles.header}>
        <View style={whatIfStyles.icon}>
          <MaterialCommunityIcons
            color={colors.accent}
            name="calculator-variant-outline"
            size={22}
          />
        </View>
        <View style={whatIfStyles.copy}>
          <Text style={whatIfStyles.title}>Et si vous réduisiez ?</Text>
          <Text style={whatIfStyles.subtitle}>
            Simulez l'impact d'une réduction
          </Text>
        </View>
      </View>

      <View style={whatIfStyles.example}>
        <WhatIfRow label="Catégorie" value={result.category_name} />
        <WhatIfRow label="Réduction" value={`${result.reduction_percent}%`} />
        <View style={whatIfStyles.divider} />
        <WhatIfRow
          label="Économie/mois"
          value={`${formatMoney(result.monthly_saving, currency)}`}
          highlight
        />
        <WhatIfRow
          label="Économie/an"
          value={`${formatMoney(result.annual_saving, currency)}`}
          highlight
        />
      </View>

      <Pressable style={whatIfStyles.button} onPress={() => router.push("/simulation")}>
        <MaterialCommunityIcons
          color="#FFFFFF"
          name="play-circle-outline"
          size={20}
        />
        <Text style={whatIfStyles.buttonText}>Lancer une simulation</Text>
      </Pressable>
    </Card>
  );
}

function WhatIfRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={whatIfStyles.row}>
      <Text style={whatIfStyles.label}>{label}</Text>
      <Text style={[whatIfStyles.value, highlight && whatIfStyles.highlight]}>
        {value}
      </Text>
    </View>
  );
}

const whatIfStyles = StyleSheet.create({
  card: { gap: 14, marginTop: 12 },
  header: { alignItems: "center", flexDirection: "row", gap: 12 },
  icon: {
    alignItems: "center",
    backgroundColor: `${colors.accent}18`,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  copy: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 15, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 12 },
  example: { gap: 8 },
  divider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 4,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  label: { color: colors.textMuted, fontSize: 13 },
  value: { color: colors.text, fontSize: 14, fontWeight: "700" },
  highlight: { color: colors.success, fontWeight: "800" },
  button: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 14,
    paddingVertical: 12,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
});

// ─────────────────────────────────────────────────────────

function RecommendationCard({ reco, currency }: { reco: Recommendation; currency: string }) {
  const dotColor =
    reco.status === "ACCEPTED"
      ? colors.success
      : reco.status === "REJECTED"
        ? colors.danger
        : colors.primary;
  return (
    <View style={recoStyles.card}>
      <View style={[recoStyles.dot, { backgroundColor: dotColor }]} />
      <View style={recoStyles.copy}>
        <Text style={recoStyles.title}>{reco.category_name}</Text>
        <Text style={recoStyles.impact}>
          {reco.justification || `Impact estimé : −${formatMoney(reco.impact_estimated, currency)}/mois`}
        </Text>
      </View>
    </View>
  );
}

const recoStyles = StyleSheet.create({
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
  dot: { borderRadius: 6, height: 10, width: 10 },
  copy: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 14, fontWeight: "600" },
  impact: { color: colors.textMuted, fontSize: 12 },
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
//  SEASONALITY — PLACEHOLDER (no multi-month backend series)
// ═══════════════════════════════════════════════════════════

const SEASON_TREND = [62, 64, 61, 68, 72, 85];

function SeasonalityCard() {
  const max = Math.max(...SEASON_TREND);

  return (
    <Card style={seasonStyles.card}>
      <Text style={seasonStyles.title}>Tendance saisonnière</Text>
      <Text style={seasonStyles.subtitle}>
        Vos dépenses augmentent habituellement sur cette période.
      </Text>

      <View style={seasonStyles.chart}>
        {SEASON_TREND.map((val, i) => {
          const isLast = i === SEASON_TREND.length - 1;
          return (
            <View key={i} style={seasonStyles.col}>
              <View
                style={[
                  seasonStyles.bar,
                  { height: `${(val / max) * 100}%` },
                  isLast && seasonStyles.barActive,
                ]}
              >
                {isLast && (
                  <View style={seasonStyles.arrow}>
                    <Text style={seasonStyles.arrowText}>↗</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <View style={seasonStyles.labels}>
        <Text style={seasonStyles.label}>Mars</Text>
        <Text style={seasonStyles.label}>Août</Text>
      </View>

      <View style={seasonStyles.metrics}>
        <View style={seasonStyles.metric}>
          <Text style={seasonStyles.metricValue}>—</Text>
          <Text style={seasonStyles.metricLabel}>Fiabilité</Text>
        </View>
        <View style={seasonStyles.metric}>
          <Text style={seasonStyles.metricValue}>—</Text>
          <Text style={seasonStyles.metricLabel}>Hausse</Text>
        </View>
        <View style={seasonStyles.metric}>
          <Text style={seasonStyles.metricValue}>—</Text>
          <Text style={seasonStyles.metricLabel}>Historique</Text>
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
    gap: 16,
    padding: 20,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: -10,
  },

  chart: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 6,
    height: 64,
  },
  col: {
    alignItems: "center",
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
  },
  bar: {
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
    width: "100%",
  },
  barActive: {
    backgroundColor: colors.primary,
    borderRadius: 10,
  },
  arrow: {
    alignItems: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 6,
  },
  arrowText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },

  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
  },

  metrics: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 16,
  },
  metric: {
    alignItems: "center",
    gap: 4,
  },
  metricValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
});

// ═══════════════════════════════════════════════════════════
//  COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════

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
  const [aiSummary, setAiSummary] = useState<string>(
    "Analyse IA en cours de chargement…"
  );
  const [history, setHistory] = useState<AIAnalysisStored[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          if (!userId) return;
          const [catsRes, recos, stored] = await Promise.all([
            analyticsApi.categories(userId, period),
            budgetApi.listRecommendations(userId, period).catch(() => ({ items: [] as Recommendation[] })),
            aiApi.listAnalyses(userId, { limit: 10 }).catch(() => ({ items: [] as AIAnalysisStored[] })),
          ]);

          if (cancelled) return;
          setDriftCats(catsRes.filter((c) => Math.abs(c.variation_percentage) > 5));
          setRecommendations(recos.items);
          setHistory(stored.items);

          // run what-if on top opportunity category with 20% reduction
          const topCat = catsRes.reduce(
            (best, c) =>
              c.opportunity_score > (best?.opportunity_score ?? -1) ? c : best,
            null as CategoryAnalytics | null
          );
          if (topCat) {
            try {
              const res = await whatIfApi.simulate(userId, period, {
                category_id: topCat.category_id,
                reduction_percent: 20,
              });
              if (!cancelled) setWhatIfResult(res);
            } catch {
              /* leave null */
            }
          }

          // AI summary
          try {
            const aiRes = await aiApi.analyze(userId, period);
            if (!cancelled && aiRes?.summary) setAiSummary(aiRes.summary);
          } catch {
            if (!cancelled)
              setAiSummary("Analyse IA indisponible pour ce mois-ci.");
          }
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
        <SectionTitle action="Tout voir" title="Catégories à surveiller" />
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
        <WhatIfCard result={whatIfResult} currency={currency} />

        {/* ── Recommandations ── */}
        <SectionTitle action="Voir tout" title="Recommandations" />
        <View style={styles.listGap}>
          {recommendations.length > 0 ? (
            recommendations.map((reco) => (
              <RecommendationCard key={reco.id} reco={reco} currency={currency} />
            ))
          ) : (
            <Text style={styles.emptyText}>Aucune recommandation active pour {monthLabel(period)}.</Text>
          )}
        </View>

        {/* ── Tendance saisonnière ── */}
        <SectionTitle title="Tendance saisonnière" />
        <SeasonalityCard />
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
