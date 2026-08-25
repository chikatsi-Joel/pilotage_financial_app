import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Card, Pill, SectionTitle } from "../../src/ui/components";
import { colors } from "../../src/ui/theme";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

interface DriftCategory {
  name: string;
  icon: IconName;
  current: string;
  baseline: string;
  variation: string;
  score: number;
  tone: string;
}

interface WhatIfData {
  category: string;
  current: string;
  reduction: string;
  monthlySaving: string;
  annualSaving: string;
}

interface Recommendation {
  title: string;
  impact: string;
  dotColor: string;
}

const DRIFT_CATEGORIES: DriftCategory[] = [
  {
    name: "Restaurants",
    icon: "food-outline",
    current: "87 000",
    baseline: "62 000",
    variation: "+40 %",
    score: 0.82,
    tone: colors.warning,
  },
  {
    name: "Transport",
    icon: "car-outline",
    current: "48 000",
    baseline: "45 000",
    variation: "+7 %",
    score: 0.31,
    tone: colors.success,
  },
  {
    name: "Abonnements",
    icon: "wifi",
    current: "25 000",
    baseline: "18 000",
    variation: "+39 %",
    score: 0.71,
    tone: colors.warning,
  },
];

const WHAT_IF_DATA: WhatIfData = {
  category: "Restaurants",
  current: "87 000",
  reduction: "20 %",
  monthlySaving: "17 400",
  annualSaving: "208 800",
};

const RECOMMENDATIONS: Recommendation[] = [
  {
    title: "Limiter les restaurants à 2/semaine",
    impact: "Impact : − 17 400 FCFA/mois",
    dotColor: colors.warning,
  },
  {
    title: "Revoir les abonnements streaming",
    impact: "Impact : − 10 000 FCFA/mois",
    dotColor: colors.accent,
  },
];

// ═══════════════════════════════════════════════════════════
//  SOUS-COMPOSANTS
// ═══════════════════════════════════════════════════════════

function AiSummaryCard() {
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

      <Text style={aiStyles.summary}>
        Votre mois d'août montre une hausse des dépenses non essentielles,
        principalement drivée par les restaurants. L'épargne reste correcte
        mais un ajustement sur 2 catégories pourrait libérer 35 000 FCFA.
      </Text>

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

function DriftCategoryCard({ category }: { category: DriftCategory }) {
  return (
    <Card style={driftStyles.card}>
      <View style={driftStyles.row}>
        <View
          style={[
            driftStyles.icon,
            { backgroundColor: `${category.tone}18` },
          ]}
        >
          <MaterialCommunityIcons
            color={category.tone}
            name={category.icon}
            size={22}
          />
        </View>

        <View style={driftStyles.copy}>
          <View style={driftStyles.titleRow}>
            <Text style={driftStyles.name}>{category.name}</Text>
            <Pill label={category.variation} tone="warning" />
          </View>

          <View style={driftStyles.amounts}>
            <Text style={driftStyles.current}>{category.current} FCFA</Text>
            <Text style={driftStyles.sep}>·</Text>
            <Text style={driftStyles.baseline}>moy. {category.baseline}</Text>
          </View>

          <View style={driftStyles.scoreRail}>
            <View
              style={[
                driftStyles.scoreFill,
                {
                  backgroundColor: category.tone,
                  width: `${category.score * 100}%`,
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

function WhatIfCard() {
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
        <WhatIfRow label="Catégorie" value={WHAT_IF_DATA.category} />
        <WhatIfRow label="Réduction" value={WHAT_IF_DATA.reduction} />
        <View style={whatIfStyles.divider} />
        <WhatIfRow
          label="Économie/mois"
          value={`${WHAT_IF_DATA.monthlySaving} FCFA`}
          highlight
        />
        <WhatIfRow
          label="Économie/an"
          value={`${WHAT_IF_DATA.annualSaving} FCFA`}
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

function RecommendationCard({ reco }: { reco: Recommendation }) {
  return (
    <View style={recoStyles.card}>
      <View style={[recoStyles.dot, { backgroundColor: reco.dotColor }]} />
      <View style={recoStyles.copy}>
        <Text style={recoStyles.title}>{reco.title}</Text>
        <Text style={recoStyles.impact}>{reco.impact}</Text>
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

// ═══════════════════════════════════════════════════════════
//  SEASONALITY — SIMPLE AVEC FLÈCHE DANS LA BARRE
// ═══════════════════════════════════════════════════════════

const SEASON_TREND = [62, 64, 61, 68, 72, 85];

function SeasonalityCard() {
  const max = Math.max(...SEASON_TREND);

  return (
    <Card style={seasonStyles.card}>
      <Text style={seasonStyles.title}>Tendance Août</Text>
      <Text style={seasonStyles.subtitle}>
        Vos dépenses augmentent habituellement ce mois-ci.
      </Text>

      {/* Graphe : flèche dans la dernière barre */}
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

      {/* 3 chiffres */}
      <View style={seasonStyles.metrics}>
        <View style={seasonStyles.metric}>
          <Text style={seasonStyles.metricValue}>82 %</Text>
          <Text style={seasonStyles.metricLabel}>Fiabilité</Text>
        </View>
        <View style={seasonStyles.metric}>
          <Text style={seasonStyles.metricValue}>+15 %</Text>
          <Text style={seasonStyles.metricLabel}>Hausse</Text>
        </View>
        <View style={seasonStyles.metric}>
          <Text style={seasonStyles.metricValue}>6 mois</Text>
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

  /* Graphe */
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
    borderRadius: 10, // ← plus arrondi
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

  /* Métriques */
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

export default function Insights() {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>ANALYSE</Text>
            <Text style={styles.title}>Insights</Text>
          </View>
          <View style={styles.periodButton}>
            <MaterialCommunityIcons
              color={colors.primary}
              name="calendar-month-outline"
              size={20}
            />
            <Text style={styles.periodText}>Août 2026</Text>
          </View>
        </View>

        {/* ── Analyse IA ── */}
        <AiSummaryCard />

        {/* ── Catégories à surveiller ── */}
        <SectionTitle action="Tout voir" title="Catégories à surveiller" />
        <View style={styles.listGap}>
          {DRIFT_CATEGORIES.map((cat) => (
            <DriftCategoryCard key={cat.name} category={cat} />
          ))}
        </View>

        {/* ── Simulateur ── */}
        <SectionTitle title="Simulateur" />
        <WhatIfCard />

        {/* ── Recommandations ── */}
        <SectionTitle action="Voir tout" title="Recommandations" />
        <View style={styles.listGap}>
          {RECOMMENDATIONS.map((reco, index) => (
            <RecommendationCard key={index} reco={reco} />
          ))}
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
});