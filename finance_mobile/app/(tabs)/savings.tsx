import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {Link, router} from "expo-router";
import Svg, { Circle } from "react-native-svg";

import { colors } from "../../src/ui/theme";

const GOALS = [
  {
    name: "Achat Appartement",
    sub: "Apport personnel",
    icon: "home",
    pct: "46%",
    pctNum: 0.46,
    current: "18 500 €",
    target: "40 000 €",
  },
  {
    name: "Vacances Japon",
    sub: "Prévu en Octobre",
    icon: "flight-takeoff",
    pct: "75%",
    pctNum: 0.75,
    current: "2 250 €",
    target: "3 000 €",
  },
  {
    name: "Fonds d'urgence",
    sub: "Sécurité",
    icon: "health-and-safety",
    pct: "34%",
    pctNum: 0.34,
    current: "1 700 €",
    target: "5 000 €",
  },
] as const;

const cpSize = 48;
const cpStroke = 4;
const cpRadius = (cpSize - cpStroke) / 2;
const cpCircumference = 2 * Math.PI * cpRadius;

function DonutProgress({ pct }: { pct: number }) {
  const dash = pct * cpCircumference;

  return (
    <View style={cpStyles.wrap}>
      <Svg height={cpSize} width={cpSize}>
        <Circle
          cx={cpSize / 2}
          cy={cpSize / 2}
          fill="none"
          r={cpRadius}
          stroke="#E5EEFF"
          strokeWidth={cpStroke}
        />
        <Circle
          cx={cpSize / 2}
          cy={cpSize / 2}
          fill="none"
          origin={`${cpSize / 2}, ${cpSize / 2}`}
          r={cpRadius}
          rotation={-90}
          stroke={colors.primary}
          strokeDasharray={`${dash}, ${cpCircumference}`}
          strokeLinecap="round"
          strokeWidth={cpStroke}
        />
      </Svg>
      <View style={cpStyles.center}>
        <Text style={cpStyles.pct}>{Math.round(pct * 100)}%</Text>
      </View>
    </View>
  );
}

export default function Savings() {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Total savings ── */}
        <View style={styles.totalSection}>
          <Text style={styles.totalLabel}>Épargne totale</Text>
          <Text style={styles.totalAmount}>22 450 €</Text>
          <View style={styles.totalPill}>
            <MaterialCommunityIcons
              color={colors.primary}
              name="trending-up"
              size={16}
            />
            <Text style={styles.totalPillText}>+450 € ce mois</Text>
          </View>
        </View>

        {/* ── Global progress ── */}
        <View style={styles.progressCard}>
          <View style={styles.progressLeft}>
            <Text style={styles.progressTitle}>Progression globale</Text>
            <Text style={styles.progressSub}>45% de l'objectif total</Text>
          </View>
          <DonutProgress pct={0.45} />
        </View>

        {/* ── Goals ── */}
        <Text style={styles.goalsTitle}>Vos objectifs</Text>
        <View style={styles.goalsList}>
          {GOALS.map((g) => (
            <Link key={g.name} href="/savings-detail" asChild>
            <Pressable>
            <View style={styles.goalCard}>
              <View style={styles.goalTop}>
                <View style={styles.goalLeft}>
                  <View style={styles.goalIcon}>
                    <MaterialIcons
                      color={colors.primary}
                      name={g.icon as any}
                      size={20}
                    />
                  </View>
                  <View>
                    <Text style={styles.goalName}>{g.name}</Text>
                    <Text style={styles.goalSub}>{g.sub}</Text>
                  </View>
                </View>
                <View style={styles.goalPctBadge}>
                  <Text style={styles.goalPctText}>{g.pct}</Text>
                </View>
              </View>
              <View style={styles.goalBottom}>
                <View style={styles.goalBarTrack}>
                  <View
                    style={[
                      styles.goalBarFill,
                      { width: g.pct },
                    ]}
                  />
                </View>
                <View style={styles.goalAmounts}>
                  <Text style={styles.goalCurrent}>{g.current}</Text>
                  <Text style={styles.goalTarget}>{g.target}</Text>
                </View>
              </View>
            </View>
            </Pressable>
            </Link>
          ))}
        </View>

        {/* ── AI Insight ── */}
        <View style={styles.insightCard}>
          <View style={styles.insightBlur} />
          <View style={styles.insightIcon}>
            <MaterialCommunityIcons
              color={colors.primary}
              name="star-four-points"
              size={20}
            />
          </View>
          <View style={styles.insightContent}>
            <Text style={styles.insightLabel}>
              Astuce IA{" "}
              <Text style={styles.insightDot}>●</Text>
            </Text>
            <Text style={styles.insightText}>
              Transférez 50€ automatiquement chaque mois pour finir "Vacances
              Japon" en juin.
            </Text>
            <Pressable style={styles.insightBtn}>
              <Text style={styles.insightBtnText}>
                Activer l'automatisation
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={{ height: 96 }} />
      </ScrollView>

      {/* ── FAB ── */}
      <Pressable style={styles.fab}
            onPress={() => router.push("/add-goal")}>
        <MaterialCommunityIcons color="#FFFFFF" name="plus" size={22} />
        <Text style={styles.fabText}>Nouveau</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { gap: 24, padding: 16, paddingBottom: 0 },

  /* Total */
  totalSection: { alignItems: "center", gap: 4, marginTop: 16 },
  totalLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  totalAmount: {
    color: colors.text,
    fontSize: 48,
    fontWeight: "700",
    letterSpacing: -1,
    lineHeight: 56,
    textShadowColor: "rgba(88,76,185,0.15)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 16,
  },
  totalPill: {
    alignItems: "center",
    backgroundColor: "#DCE9FF",
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  totalPillText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "600",
  },

  /* Progress */
  progressCard: {
    alignItems: "flex-end",
    backgroundColor: "rgba(255,255,255,0.70)",
    borderColor: "rgba(255,255,255,0.40)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 24,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 32,
  },
  progressLeft: { gap: 4 },
  progressTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  progressSub: {
    color: colors.textMuted,
    fontSize: 16,
  },

  /* Goals */
  goalsTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "600",
  },
  goalsList: { gap: 16 },
  goalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    gap: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 20,
  },
  goalTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  goalLeft: { alignItems: "center", flexDirection: "row", gap: 12 },
  goalIcon: {
    alignItems: "center",
    backgroundColor: `${colors.primary}18`,
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  goalName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  goalSub: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
  goalPctBadge: {
    backgroundColor: `${colors.primary}0D`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  goalPctText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "500",
  },
  goalBottom: { gap: 8 },
  goalBarTrack: {
    backgroundColor: "#EFF4FF",
    borderRadius: 99,
    height: 6,
    overflow: "hidden",
  },
  goalBarFill: {
    borderRadius: 99,
    height: "100%",
    width: "0%",
    // gradient from primary/60 to primary simulated with solid primary
    backgroundColor: colors.primary,
  },
  goalAmounts: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  goalCurrent: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
  goalTarget: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },

  /* AI Insight */
  insightCard: {
    backgroundColor: "#EFF4FF",
    borderColor: `${colors.primary}33`,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    overflow: "hidden",
    padding: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
  },
  insightBlur: {
    backgroundColor: `${colors.primary}0D`,
    borderRadius: 999,
    height: 96,
    position: "absolute",
    right: -24,
    top: -24,
    width: 96,
  },
  insightIcon: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: `${colors.primary}1A`,
    borderRadius: 12,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    width: 40,
  },
  insightContent: { flex: 1, gap: 4 },
  insightLabel: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  insightDot: { fontSize: 8 },
  insightText: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  insightBtn: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 8,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  insightBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
  },

  /* FAB */
  fab: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 24,
    bottom: 96,
    borderColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
    position: "absolute",
    right: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
  },
  fabText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});

const cpStyles = StyleSheet.create({
  wrap: { alignItems: "center", height: cpSize, justifyContent: "center", width: cpSize },
  center: { alignItems: "center", height: "100%", justifyContent: "center", position: "absolute", width: "100%" },
  pct: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
});
