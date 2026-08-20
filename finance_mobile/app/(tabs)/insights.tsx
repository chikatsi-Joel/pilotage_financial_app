import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, Pill, SectionTitle } from "../../src/ui/components";
import { colors } from "../../src/ui/theme";

const driftCategories = [
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
] as const;

const whatIfExample = {
  category: "Restaurants",
  current: "87 000",
  reduction: "20 %",
  monthlySaving: "17 400",
  annualSaving: "208 800",
};

export default function Insights() {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
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

        {/* AI Summary Card */}
        <Card style={styles.aiCard}>
          <View style={styles.aiHeader}>
            <View style={styles.aiIcon}>
              <MaterialCommunityIcons
                color="#FFFFFF"
                name="brain"
                size={22}
              />
            </View>
            <View style={styles.aiCopy}>
              <Text style={styles.aiLabel}>Analyse IA</Text>
              <Pill label="GEMMA 4" tone="neutral" />
            </View>
          </View>
          <Text style={styles.aiSummary}>
            Votre mois d'août montre une hausse des dépenses
            non essentielles, principalement drivée par les
            restaurants. L'épargne reste correcte mais une
            adjustment sur 2 catégories pourrait libérer
            35 000 FCFA.
          </Text>
          <Pressable style={styles.aiButton}>
            <Text style={styles.aiButtonText}>
              Voir l'analyse complète
            </Text>
            <MaterialCommunityIcons
              color={colors.primary}
              name="arrow-right"
              size={18}
            />
          </Pressable>
        </Card>

        {/* Drift Categories */}
        <SectionTitle
          action="Tout voir"
          title="Catégories à surveiller"
        />
        <View style={styles.driftList}>
          {driftCategories.map((cat) => (
            <Card key={cat.name} style={styles.driftCard}>
              <View style={styles.driftRow}>
                <View
                  style={[
                    styles.driftIcon,
                    { backgroundColor: `${cat.tone}18` },
                  ]}
                >
                  <MaterialCommunityIcons
                    color={cat.tone}
                    name={cat.icon as any}
                    size={22}
                  />
                </View>
                <View style={styles.driftCopy}>
                  <View style={styles.driftTitleRow}>
                    <Text style={styles.driftName}>{cat.name}</Text>
                    <Pill label={cat.variation} tone="warning" />
                  </View>
                  <View style={styles.driftAmounts}>
                    <Text style={styles.driftCurrent}>
                      {cat.current} FCFA
                    </Text>
                    <Text style={styles.driftSep}>·</Text>
                    <Text style={styles.driftBaseline}>
                      moy. {cat.baseline}
                    </Text>
                  </View>
                  <View style={styles.scoreRail}>
                    <View
                      style={[
                        styles.scoreFill,
                        {
                          backgroundColor: cat.tone,
                          width: `${cat.score * 100}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>
            </Card>
          ))}
        </View>

        {/* What-If Teaser */}
        <SectionTitle title="Simulateur" />
        <Card style={styles.whatIfCard}>
          <View style={styles.whatIfHeader}>
            <View style={styles.whatIfIcon}>
              <MaterialCommunityIcons
                color={colors.accent}
                name="calculator-variant-outline"
                size={22}
              />
            </View>
            <View style={styles.whatIfCopy}>
              <Text style={styles.whatIfTitle}>Et si vous réduisiez ?</Text>
              <Text style={styles.whatIfSubtitle}>
                Simulez l'impact d'une réduction
              </Text>
            </View>
          </View>
          <View style={styles.whatIfExample}>
            <View style={styles.whatIfRow}>
              <Text style={styles.whatIfLabel}>Catégorie</Text>
              <Text style={styles.whatIfValue}>
                {whatIfExample.category}
              </Text>
            </View>
            <View style={styles.whatIfRow}>
              <Text style={styles.whatIfLabel}>Réduction</Text>
              <Text style={styles.whatIfValue}>
                {whatIfExample.reduction}
              </Text>
            </View>
            <View style={styles.whatIfDivider} />
            <View style={styles.whatIfRow}>
              <Text style={styles.whatIfLabel}>Économie/mois</Text>
              <Text style={[styles.whatIfValue, styles.whatIfHighlight]}>
                {whatIfExample.monthlySaving} FCFA
              </Text>
            </View>
            <View style={styles.whatIfRow}>
              <Text style={styles.whatIfLabel}>Économie/an</Text>
              <Text style={[styles.whatIfValue, styles.whatIfHighlight]}>
                {whatIfExample.annualSaving} FCFA
              </Text>
            </View>
          </View>
          <Pressable style={styles.whatIfButton}>
            <MaterialCommunityIcons
              color="#FFFFFF"
              name="play-circle-outline"
              size={20}
            />
            <Text style={styles.whatIfButtonText}>
              Lancer une simulation
            </Text>
          </Pressable>
        </Card>

        {/* Recommendations Preview */}
        <SectionTitle action="Voir tout" title="Recommandations" />
        <View style={styles.recoList}>
          <Card style={styles.recoCard}>
            <View style={styles.recoRow}>
              <View style={[styles.recoDot, { backgroundColor: colors.warning }]} />
              <View style={styles.recoCopy}>
                <Text style={styles.recoTitle}>
                  Limiter les restaurants à 2/semaine
                </Text>
                <Text style={styles.recoImpact}>
                  Impact estimé : − 17 400 FCFA/mois
                </Text>
              </View>
              <Pill label="PROPOSÉ" tone="neutral" />
            </View>
          </Card>
          <Card style={styles.recoCard}>
            <View style={styles.recoRow}>
              <View style={[styles.recoDot, { backgroundColor: colors.accent }]} />
              <View style={styles.recoCopy}>
                <Text style={styles.recoTitle}>
                  Revoir les abonnements streaming
                </Text>
                <Text style={styles.recoImpact}>
                  Impact estimé : − 10 000 FCFA/mois
                </Text>
              </View>
              <Pill label="PROPOSÉ" tone="neutral" />
            </View>
          </Card>
        </View>

        {/* Seasonality Card */}
        <SectionTitle title="Tendance saisonnière" />
        <Card>
          <View style={styles.seasonRow}>
            <View style={styles.seasonIcon}>
              <MaterialCommunityIcons
                color={colors.primary}
                name="chart-timeline-variant"
                size={24}
              />
            </View>
            <View style={styles.seasonCopy}>
              <Text style={styles.seasonTitle}>
                Août = mois de hausse
              </Text>
              <Text style={styles.seasonText}>
                Historiquement, vos dépenses augmentent de
                15 % en août (rentrée, festivals). Votre
                baseline est fiable à 82 %.
              </Text>
            </View>
          </View>
          <View style={styles.seasonMetrics}>
            <View style={styles.seasonMetric}>
              <Text style={styles.seasonMetricValue}>82 %</Text>
              <Text style={styles.seasonMetricLabel}>Fiabilité</Text>
            </View>
            <View style={styles.seasonMetricDivider} />
            <View style={styles.seasonMetric}>
              <Text style={styles.seasonMetricValue}>+15 %</Text>
              <Text style={styles.seasonMetricLabel}>Hausse moy.</Text>
            </View>
            <View style={styles.seasonMetricDivider} />
            <View style={styles.seasonMetric}>
              <Text style={styles.seasonMetricValue}>6 mois</Text>
              <Text style={styles.seasonMetricLabel}>Historique</Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  aiButton: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 14,
    paddingVertical: 12,
  },
  aiButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  aiCard: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primarySoft,
    gap: 12,
    marginTop: 24,
  },
  aiCopy: { flex: 1, gap: 4 },
  aiHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
  aiIcon: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 16,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  aiLabel: { color: colors.primary, fontSize: 15, fontWeight: "800" },
  aiSummary: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  content: { padding: 20, paddingBottom: 32 },
  driftAmounts: { alignItems: "center", flexDirection: "row", gap: 6 },
  baseline: { color: colors.textMuted, fontSize: 12 },
  driftBaseline: { color: colors.textMuted, fontSize: 12 },
  driftCard: { gap: 10, padding: 15 },
  driftCopy: { flex: 1, gap: 7 },
  driftCurrent: { color: colors.text, fontSize: 13, fontWeight: "700" },
  driftIcon: {
    alignItems: "center",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  driftList: { gap: 10 },
  driftName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  driftRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  driftSep: { color: colors.textMuted, fontSize: 10 },
  driftTitleRow: {
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
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  periodButton: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    height: 43,
  },
  periodText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  recoCard: { padding: 14 },
  recoCopy: { flex: 1, gap: 3 },
  recoDot: { borderRadius: 6, height: 10, width: 10 },
  recoImpact: { color: colors.textMuted, fontSize: 12 },
  recoList: { gap: 8 },
  recoRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  recoTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scoreFill: { borderRadius: 4, height: "100%" },
  scoreRail: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 4,
    height: 6,
    overflow: "hidden",
  },
  seasonCopy: { flex: 1, gap: 4 },
  seasonIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    height: 47,
    justifyContent: "center",
    width: 47,
  },
  seasonMetric: { alignItems: "center", flex: 1 },
  seasonMetricDivider: {
    backgroundColor: colors.border,
    height: 32,
    width: 1,
  },
  seasonMetricLabel: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  seasonMetricValue: { color: colors.text, fontSize: 16, fontWeight: "800" },
  seasonMetrics: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    marginTop: 16,
    paddingTop: 16,
  },
  seasonRow: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  seasonText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  seasonTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  title: { color: colors.text, fontSize: 25, fontWeight: "800", marginTop: 4 },
  whatIfButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 14,
    paddingVertical: 12,
  },
  whatIfButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  whatIfCard: { gap: 14, marginTop: 12 },
  whatIfCopy: { flex: 1, gap: 3 },
  whatIfDivider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 4,
  },
  whatIfExample: { gap: 8 },
  whatIfHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
  whatIfHighlight: { color: colors.success, fontWeight: "800" },
  whatIfIcon: {
    alignItems: "center",
    backgroundColor: `${colors.accent}18`,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  whatIfLabel: { color: colors.textMuted, fontSize: 13 },
  whatIfRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  whatIfSubtitle: { color: colors.textMuted, fontSize: 12 },
  whatIfTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  whatIfValue: { color: colors.text, fontSize: 14, fontWeight: "700" },
});
