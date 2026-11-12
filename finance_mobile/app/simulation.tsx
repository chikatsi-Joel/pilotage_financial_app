import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams } from "expo-router";

import { analytics as analyticsApi } from "../src/shared/api/analytics";
import { budget as budgetApi } from "../src/shared/api/budget";
import { savings as savingsApi } from "../src/shared/api/savings";
import { whatIf as whatIfApi } from "../src/shared/api/whatIf";
import { useAppStore } from "../src/shared/store";
import type { Recommendation } from "../src/shared/types";
import { formatMoney } from "../src/shared/utils/money";
import { buildSavingsTrajectory } from "../src/shared/utils/savingsTrajectory";
import { goalImpact, lineSaving, scenarioTotals, type GoalImpact } from "../src/shared/utils/scenario";
import { EmptyState, ScreenHeader } from "../src/ui/components";
import { EffortSlider, YearBars } from "../src/ui/scenarioCharts";
import { colors, interFonts } from "../src/ui/theme";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const CATEGORY_ICONS: Record<string, IconName> = {
  Alimentation: "cart-outline",
  "Logement & Charges": "home-outline",
  Transports: "car-outline",
  Transport: "car-outline",
  Restaurants: "silverware-fork-knife",
  Santé: "medical-bag",
  Loisirs: "movie-open-outline",
  "Sorties & Loisirs": "ticket-confirmation-outline",
  Abonnements: "wifi",
  Shopping: "shopping-outline",
  Éducation: "school-outline",
  Épargne: "piggy-bank-outline",
  Impôts: "cash-multiple",
};
const categoryIcon = (name: string): IconName => CATEGORY_ICONS[name] ?? "tag-outline";

const MAX_EFFORT = 60;
const MAX_GOALS = 3;
const MAX_RECOS = 2;

/** Catégorie simulable : sa dépense mensuelle de référence (habituelle ou du mois). */
interface CatLine {
  id: string;
  name: string;
  reference: number;
  basis: "habituel" | "mois_en_cours";
}

interface GoalLine {
  id: string;
  name: string;
  current: number;
  target: number;
  monthlyPace: number;
}

function monthsLabel(n: number): string {
  if (n >= 12 && n % 12 === 0) return `${n / 12} an${n > 12 ? "s" : ""}`;
  return `${n} mois`;
}

/** Simulation complète : plusieurs efforts combinés, projection sur un an, effet sur les objectifs. */
export default function Simulation() {
  const userId = useAppStore((s) => s.userId);
  const period = useAppStore((s) => s.currentPeriod);
  const currency = useAppStore((s) => s.currency);
  const params = useLocalSearchParams<{ category?: string; percent?: string }>();

  const [lines, setLines] = useState<CatLine[]>([]);
  const [efforts, setEfforts] = useState<Record<string, number>>({});
  const [totals, setTotals] = useState({ income: 0, expenses: 0 });
  const [goals, setGoals] = useState<GoalLine[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [cats, dash, goalsRes, recs] = await Promise.all([
        analyticsApi.categories(userId, period),
        analyticsApi.dashboard(userId, period).catch(() => null),
        savingsApi.list(userId, { limit: 50 }).catch(() => null),
        budgetApi.listRecommendations(userId, period).catch(() => null),
      ]);
      const useful = cats.filter((c) => c.current_amount > 0 || c.baseline_amount > 0);
      /* La référence (moyenne des mois précédents ou mois en cours) vient du serveur. */
      const refs = await Promise.all(
        useful.map((c) =>
          whatIfApi
            .simulate(userId, period, { category_id: c.category_id, reduction_percent: 0 })
            .then((r): CatLine => ({ id: c.category_id, name: c.name, reference: r.reference_amount, basis: r.reference_basis }))
            .catch(() => null),
        ),
      );
      const next = refs
        .filter((l): l is CatLine => l !== null && l.reference > 0)
        .sort((a, b) => b.reference - a.reference);
      setLines(next);
      setEfforts((prev) => {
        const kept: Record<string, number> = {};
        for (const l of next) if (prev[l.id]) kept[l.id] = prev[l.id];
        const fromInsights = params.category && next.some((l) => l.id === params.category);
        if (Object.keys(kept).length === 0 && fromInsights) {
          kept[params.category as string] = Math.min(Number(params.percent) || 20, MAX_EFFORT);
        }
        return kept;
      });
      setTotals({ income: dash?.income ?? 0, expenses: dash?.expenses ?? 0 });

      const today = new Date();
      setGoals(
        (goalsRes?.items ?? [])
          .filter((g) => g.active && g.current_amount < g.target_amount)
          .map((g) => ({
            id: g.id,
            name: g.name,
            current: g.current_amount,
            target: g.target_amount,
            monthlyPace: buildSavingsTrajectory({
              contributions: g.contributions,
              current: g.current_amount,
              target: g.target_amount,
              deadline: g.deadline,
              today,
            }).monthlyPace,
          }))
          .slice(0, MAX_GOALS),
      );
      setRecommendations(recs?.items ?? []);
    } catch {
      setLines([]);
      setLoadError("Impossible de charger vos catégories. Vérifiez la connexion au serveur.");
    } finally {
      setLoading(false);
    }
  }, [userId, period, params.category, params.percent]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const scenario = useMemo(
    () =>
      scenarioTotals(
        lines.map((l) => ({ reference: l.reference, percent: efforts[l.id] ?? 0 })),
        totals.income,
        totals.expenses,
      ),
    [lines, efforts, totals],
  );

  const recos = useMemo(
    () =>
      recommendations
        .filter((r) => r.status === "PROPOSED" && (efforts[r.category_id] ?? 0) > 0)
        .slice(0, MAX_RECOS),
    [recommendations, efforts],
  );

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

  if (!userId) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ScreenHeader title="Simulation" />
        <EmptyState title="Aucune session active" subtitle="Lancez l'inscription pour simuler." />
      </SafeAreaView>
    );
  }

  const hasEffort = scenario.efforts > 0;

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScreenHeader title="Simulation" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Votre scénario ── */}
        <View style={styles.hero}>
          <View pointerEvents="none" style={styles.heroOrb1} />
          <View pointerEvents="none" style={styles.heroOrb2} />
          <Text style={styles.heroLabel}>Votre scénario</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.heroAmount}>
            + {formatMoney(scenario.monthly, currency)}
            <Text style={styles.heroPer}> /mois</Text>
          </Text>
          <View style={styles.heroMeta}>
            <View style={styles.heroBadge}>
              <MaterialCommunityIcons color="#FFFFFF" name="calendar-range" size={14} />
              <Text style={styles.heroBadgeText}>{formatMoney(scenario.annual, currency)} par an</Text>
            </View>
            {scenario.rate !== null && hasEffort ? (
              <View style={styles.heroBadge}>
                <MaterialCommunityIcons color="#FFFFFF" name="piggy-bank-outline" size={14} />
                <Text style={styles.heroBadgeText}>Épargne {Math.round(scenario.rate * 100)} %</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.heroHint}>
            {hasEffort
              ? `${scenario.efforts} effort${scenario.efforts > 1 ? "s" : ""} combiné${scenario.efforts > 1 ? "s" : ""}`
              : "Réglez un ou plusieurs efforts ci-dessous"}
          </Text>
        </View>

        {/* ── Vos efforts ── */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Vos efforts</Text>
          {hasEffort ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setEfforts({})}>
              <Text style={styles.reset}>Réinitialiser</Text>
            </Pressable>
          ) : null}
        </View>

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
        ) : lines.length === 0 ? (
          <View style={styles.card}>
            <EmptyState title="Aucune catégorie" subtitle="Ajoutez des dépenses pour obtenir des projections." />
          </View>
        ) : (
          <View style={[styles.card, styles.effortsCard]}>
            <View pointerEvents="none" style={styles.cardOrb} />
            {lines.map((l, i) => {
              const pct = efforts[l.id] ?? 0;
              const saving = lineSaving({ reference: l.reference, percent: pct });
              return (
                <View key={l.id} style={[styles.effort, i > 0 && styles.effortSep]}>
                  <View style={styles.effortHead}>
                    <View style={[styles.effortIcon, pct > 0 && styles.effortIconActive]}>
                      <MaterialCommunityIcons
                        color={pct > 0 ? "#FFFFFF" : colors.primary}
                        name={categoryIcon(l.name)}
                        size={16}
                      />
                    </View>
                    <View style={styles.effortCopy}>
                      <Text numberOfLines={1} style={styles.effortName}>{l.name}</Text>
                      <Text style={styles.effortRef}>
                        {formatMoney(l.reference, currency)}/mois · {l.basis === "habituel" ? "habituel" : "ce mois"}
                      </Text>
                    </View>
                    <Text style={[styles.effortGain, pct === 0 && styles.effortGainIdle]}>
                      {pct > 0 ? `+${formatMoney(saving, currency)}` : "—"}
                    </Text>
                  </View>
                  <EffortSlider
                    label={`Effort sur ${l.name}`}
                    max={MAX_EFFORT}
                    onChange={(v) => setEfforts((prev) => ({ ...prev, [l.id]: v }))}
                    value={pct}
                  />
                </View>
              );
            })}
          </View>
        )}

        {/* ── Sur 12 mois ── */}
        {hasEffort ? (
          <>
            <Text style={[styles.sectionTitle, styles.sectionAlone]}>Sur 12 mois</Text>
            <View style={styles.card}>
              <YearBars monthly={scenario.monthly} />
              <Text style={styles.curveNote}>
                Économie cumulée si vous tenez ce scénario chaque mois.
              </Text>
            </View>
          </>
        ) : null}

        {/* ── Effet sur vos objectifs ── */}
        {hasEffort && goals.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, styles.sectionAlone]}>Vos objectifs d'épargne</Text>
            <View style={[styles.card, styles.goalsCard]}>
              {goals.map((g, i) => (
                <GoalRow
                  first={i === 0}
                  impact={goalImpact({ ...g, extra: scenario.monthly })}
                  key={g.id}
                  name={g.name}
                />
              ))}
              <Text style={styles.curveNote}>Si l'économie est versée sur l'objectif, en plus de vos versements actuels.</Text>
            </View>
          </>
        ) : null}

        {/* ── Recommandations liées ── */}
        {recos.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, styles.sectionAlone]}>Recommandations liées</Text>
            {decideError ? <Text style={[styles.errorText, styles.padded]}>{decideError}</Text> : null}
            {recos.map((r) => (
              <View key={r.id} style={styles.reco}>
                <View style={styles.recoTop}>
                  <View style={styles.recoIcon}>
                    <MaterialCommunityIcons color={colors.primary} name="star-four-points" size={18} />
                  </View>
                  <View style={styles.recoCopy}>
                    <Text style={styles.recoTitle}>{r.category_name}</Text>
                    <Text style={styles.recoDesc}>{r.justification}</Text>
                    <Text style={styles.recoImpact}>Impact estimé : {formatMoney(r.impact_estimated, currency)}</Text>
                  </View>
                </View>
                <View style={styles.recoBtns}>
                  <Pressable
                    disabled={decidingId !== null}
                    onPress={() => decide(r, "REJECTED")}
                    style={[styles.btnIgnore, decidingId !== null && { opacity: 0.6 }]}
                  >
                    <Text style={styles.btnIgnoreText}>Ignorer</Text>
                  </Pressable>
                  <Pressable
                    disabled={decidingId !== null}
                    onPress={() => decide(r, "ACCEPTED")}
                    style={[styles.btnApply, decidingId !== null && { opacity: 0.6 }]}
                  >
                    {decidingId === r.id ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Text style={styles.btnApplyText}>Appliquer</Text>
                        <MaterialCommunityIcons color="#FFFFFF" name="check" size={16} />
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function GoalRow({ name, impact, first }: { name: string; impact: GoalImpact; first: boolean }) {
  let text: string;
  let good = true;
  switch (impact.kind) {
    case "sooner":
      text = `atteint ${monthsLabel(impact.gained)} plus tôt (en ${monthsLabel(impact.months)})`;
      break;
    case "possible":
      text = `atteignable en ${monthsLabel(impact.months)}`;
      break;
    case "reached":
      text = "déjà atteint";
      break;
    default:
      text = "pas d'avance notable";
      good = false;
  }
  return (
    <View style={[styles.goalRow, !first && styles.effortSep]}>
      <View style={[styles.goalIcon, !good && styles.goalIconIdle]}>
        <MaterialCommunityIcons color={good ? colors.success : colors.textMuted} name="flag-checkered" size={16} />
      </View>
      <Text numberOfLines={1} style={styles.goalName}>{name}</Text>
      <Text style={[styles.goalText, !good && { color: colors.textMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scroll: { paddingBottom: 32 },
  padded: { paddingHorizontal: 16 },

  hero: {
    backgroundColor: colors.primary,
    borderRadius: 24,
    elevation: 4,
    gap: 6,
    marginHorizontal: 16,
    marginTop: 20,
    overflow: "hidden",
    padding: 18,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  heroOrb1: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 999,
    height: 150,
    position: "absolute",
    right: -50,
    top: -60,
    width: 150,
  },
  heroOrb2: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    bottom: -36,
    height: 100,
    left: -30,
    position: "absolute",
    width: 100,
  },
  heroLabel: {
    color: "rgba(255,255,255,0.80)",
    fontFamily: interFonts.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroAmount: { color: "#FFFFFF", fontFamily: interFonts.bold, fontSize: 34, letterSpacing: -1, lineHeight: 42 },
  heroPer: { color: "rgba(255,255,255,0.75)", fontFamily: interFonts.semibold, fontSize: 15, letterSpacing: 0 },
  heroMeta: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  heroBadge: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroBadgeText: { color: "#FFFFFF", fontFamily: interFonts.semibold, fontSize: 11 },
  heroHint: { color: "rgba(255,255,255,0.75)", fontFamily: interFonts.regular, fontSize: 11, marginTop: 2 },

  sectionHead: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: { color: colors.text, fontFamily: interFonts.bold, fontSize: 16 },
  sectionAlone: { marginTop: 24, paddingHorizontal: 16 },
  reset: { color: colors.primary, fontFamily: interFonts.semibold, fontSize: 12 },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    elevation: 2,
    marginHorizontal: 16,
    marginTop: 10,
    overflow: "hidden",
    padding: 16,
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardOrb: {
    backgroundColor: `${colors.primary}0A`,
    borderRadius: 999,
    height: 140,
    position: "absolute",
    right: -50,
    top: -50,
    width: 140,
  },
  effortsCard: { paddingVertical: 8 },
  effort: { gap: 4, paddingVertical: 10 },
  effortSep: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  effortHead: { alignItems: "center", flexDirection: "row", gap: 10 },
  effortIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  effortIconActive: { backgroundColor: colors.primary },
  effortCopy: { flex: 1 },
  effortName: { color: colors.text, fontFamily: interFonts.semibold, fontSize: 13 },
  effortRef: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 10.5 },
  effortGain: { color: colors.success, fontFamily: interFonts.bold, fontSize: 13 },
  effortGainIdle: { color: colors.textMuted, fontFamily: interFonts.medium },

  curveNote: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 10.5, marginTop: 6 },

  goalsCard: { paddingVertical: 10 },
  goalRow: { alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 8 },
  goalIcon: {
    alignItems: "center",
    backgroundColor: colors.successSoft,
    borderRadius: 10,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  goalIconIdle: { backgroundColor: colors.surfaceMuted },
  goalName: { color: colors.text, flexShrink: 1, fontFamily: interFonts.semibold, fontSize: 13 },
  goalText: { color: colors.success, flex: 1, fontFamily: interFonts.semibold, fontSize: 11.5, textAlign: "right" },

  errorText: { color: colors.danger, fontFamily: interFonts.semibold, fontSize: 12, marginBottom: 8 },
  retry: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: { color: "#FFFFFF", fontFamily: interFonts.bold, fontSize: 12 },

  reco: {
    backgroundColor: "#F6F4FF",
    borderColor: `${colors.primary}22`,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 16,
  },
  recoTop: { flexDirection: "row", gap: 12 },
  recoIcon: {
    alignItems: "center",
    backgroundColor: `${colors.primary}1A`,
    borderRadius: 99,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  recoCopy: { flex: 1, gap: 3 },
  recoTitle: { color: colors.text, fontFamily: interFonts.bold, fontSize: 14 },
  recoDesc: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 12.5, lineHeight: 18 },
  recoImpact: { color: colors.primary, fontFamily: interFonts.bold, fontSize: 12 },
  recoBtns: { flexDirection: "row", gap: 10 },
  btnIgnore: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    flex: 1,
    paddingVertical: 11,
  },
  btnIgnoreText: { color: colors.primary, fontFamily: interFonts.semibold, fontSize: 13 },
  btnApply: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 12,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 11,
  },
  btnApplyText: { color: "#FFFFFF", fontFamily: interFonts.semibold, fontSize: 13 },
});
