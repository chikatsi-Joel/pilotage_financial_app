import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { colors } from "../src/ui/theme";

const QUICK_WINS = [
  {
    icon: "fitness_center",
    iconBg: "#E5EEFF",
    iconColor: colors.text,
    title: "Abo. Salle de sport",
    desc: "Non utilisé depuis 3 mois. Économie potentielle : 45€/mois.",
    btn: "Résilier",
    btnBg: "#FFDAD6",
    btnColor: "#93000A",
  },
  {
    icon: "trending_up",
    iconBg: "#E4DFFF",
    iconColor: colors.primary,
    title: "Transfert Livret A",
    desc: "Le solde de votre compte courant est élevé. Transférez 1500€.",
    btn: "Voir l'action",
    btnBg: "#E4DFFF",
    btnColor: "#160066",
  },
  {
    icon: "subscriptions",
    iconBg: "#E3E1ED",
    iconColor: "#64636D",
    title: "Double Abo. Streaming",
    desc: "Netflix et Disney+ identifiés. Envisagez de n'en garder qu'un.",
    btn: "Voir",
    btnBg: "#E3E1ED",
    btnColor: "#1A1B23",
  },
] as const;

const chartW = 300;
const chartH = 180;

export default function SavingsDetail() {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <MaterialCommunityIcons color={colors.text} name="arrow-left" size={22} />
            </Pressable>
            <Text style={styles.headerTitle}>Épargne</Text>
          </View>
          <View style={styles.avatar}>
            <MaterialCommunityIcons color="#FFFFFF" name="account" size={18} />
          </View>
        </View>

        {/* ── Main goal card ── */}
        <View style={styles.goalCard}>
          <View style={styles.goalDecorTop} />
          <View style={styles.goalDecorBottom} />

          <View style={styles.goalTop}>
            <View style={styles.goalInfo}>
              <View style={styles.goalIcon}>
                <MaterialIcons color={colors.primary} name="apartment" size={24} />
              </View>
              <View>
                <Text style={styles.goalTitle}>Achat Appartement</Text>
                <Text style={styles.goalSub}>Objectif : Mai 2026</Text>
              </View>
            </View>
            <Pressable style={styles.editBtn}>
              <MaterialCommunityIcons color={colors.textMuted} name="pencil" size={18} />
            </Pressable>
          </View>

          <View style={styles.goalAmounts}>
            <View>
              <Text style={styles.goalCurrentAmount}>18 500 </Text>
              <Text style={styles.goalCurrency}>€</Text>
            </View>
            <View style={styles.goalTargetCol}>
              <Text style={styles.goalTargetLabel}>Cible</Text>
              <Text style={styles.goalTargetAmount}>40 000 €</Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: "46.25%" }]} />
          </View>
          <View style={styles.progressMeta}>
            <Text style={styles.progressPct}>46% atteint</Text>
            <Text style={styles.progressRemain}>Reste : 21 500 €</Text>
          </View>
        </View>

        {/* ── Acceleration card ── */}
        <View style={styles.accelCard}>
          <View style={styles.accelDecor} />
          <View style={styles.accelContent}>
            <View style={styles.accelTop}>
              <View>
                <View style={styles.accelTitleRow}>
                  <MaterialCommunityIcons color="#260059" name="flash" size={20} />
                  <Text style={styles.accelTitle}>Potentiel d'accélération</Text>
                </View>
                <Text style={styles.accelDesc}>
                  En optimisant vos abonnements et en plaçant sur un Livret A, vous
                  pourriez atteindre votre objectif{" "}
                  <Text style={styles.accelBold}>4 mois plus tôt</Text>.
                </Text>
              </View>
              <View style={styles.accelBadge}>
                <Text style={styles.accelBadgeLabel}>Gain estimé</Text>
                <Text style={styles.accelBadgeValue}>+125 €<Text style={styles.accelBadgeUnit}>/mois</Text></Text>
              </View>
            </View>
            <Pressable style={styles.accelBtn}>
              <MaterialCommunityIcons color="#FFFBFF" name="star-four-points" size={18} />
              <Text style={styles.accelBtnText}>Appliquer l'optimisation</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Projection chart ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Projection de trajectoire</Text>
          <Pressable style={styles.detailsBtn}>
            <Text style={styles.detailsBtnText}>Détails</Text>
            <MaterialCommunityIcons color={colors.primary} name="chevron-right" size={16} />
          </Pressable>
        </View>
        <View style={styles.chartCard}>
          <Svg height={chartH} width="100%" viewBox={`0 0 ${chartW} ${chartH}`}>
            <Defs>
              <LinearGradient id="optFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.2} />
                <Stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {/* Grid lines */}
            <Line x1={0} y1={30} x2={chartW} y2={30} stroke="#E3E1ED" strokeWidth={1} strokeDasharray="4 4" />
            <Line x1={0} y1={75} x2={chartW} y2={75} stroke="#E3E1ED" strokeWidth={1} strokeDasharray="4 4" />
            <Line x1={0} y1={120} x2={chartW} y2={120} stroke="#E3E1ED" strokeWidth={1} strokeDasharray="4 4" />

            {/* Current line (dashed) */}
            <Path d="M0 135 Q 50 120, 100 105 T 200 70 T 300 45" fill="none" stroke="#C7C5D1" strokeWidth={2} strokeDasharray="6 4" />

            {/* Optimized fill */}
            <Path d="M0 135 Q 50 115, 100 90 T 200 40 T 300 10 L 300 180 L 0 180 Z" fill="url(#optFill)" />

            {/* Optimized line */}
            <Path d="M0 135 Q 50 115, 100 90 T 200 40 T 300 10" fill="none" stroke={colors.primary} strokeWidth={3} />

            {/* End dots */}
            <Circle cx={300} cy={10} r={4} fill={colors.primary} />
            <Circle cx={300} cy={45} r={3} fill="#C7C5D1" />
          </Svg>

          {/* X-axis labels */}
          <View style={styles.chartXAxis}>
            <Text style={styles.chartXLabel}>Auj.</Text>
            <Text style={styles.chartXLabel}>S2 25</Text>
            <Text style={styles.chartXLabel}>S1 26</Text>
            <Text style={styles.chartXLabel}>S2 26</Text>
          </View>

          {/* Legend */}
          <View style={styles.chartLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: colors.primary }]} />
              <Text style={styles.legendText}>Optimisé</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: "#C7C5D1", borderStyle: "dashed" }]} />
              <Text style={styles.legendText}>Actuel</Text>
            </View>
          </View>
        </View>

        {/* ── Quick wins ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Gains rapides</Text>
          <View style={styles.quickWinBadge}>
            <Text style={styles.quickWinBadgeText}>3 actions</Text>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickWinsScroll}
          snapToInterval={252}
          decelerationRate="fast"
        >
          {QUICK_WINS.map((w) => (
            <View key={w.title} style={styles.quickWinCard}>
              <View style={[styles.qwIcon, { backgroundColor: w.iconBg }]}>
                <MaterialIcons color={w.iconColor} name={w.icon as any} size={20} />
              </View>
              <Text style={styles.qwTitle}>{w.title}</Text>
              <Text style={styles.qwDesc} numberOfLines={2}>{w.desc}</Text>
              <Pressable style={[styles.qwBtn, { backgroundColor: w.btnBg }]}>
                <Text style={[styles.qwBtnText, { color: w.btnColor }]}>{w.btn}</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Bottom nav ── */}
      <View style={styles.bottomNav}>
        <Pressable style={styles.navItem} onPress={() => router.replace("/")}>
          <MaterialCommunityIcons color={colors.textMuted} name="view-dashboard-outline" size={24} />
          <Text style={styles.navLabel}>Dashboard</Text>
        </Pressable>
        <Pressable style={styles.navItem} onPress={() => router.replace("/(tabs)/analyse")}>
          <MaterialCommunityIcons color={colors.textMuted} name="chart-timeline-variant-shimmer" size={24} />
          <Text style={styles.navLabel}>Analyse</Text>
        </Pressable>
        <Pressable style={styles.navItem} onPress={() => router.replace("/(tabs)/budget")}>
          <MaterialCommunityIcons color={colors.textMuted} name="wallet-outline" size={24} />
          <Text style={styles.navLabel}>Budget</Text>
        </Pressable>
        <Pressable style={[styles.navItem, styles.navItemActive]}>
          <MaterialCommunityIcons color={colors.primary} name="piggy-bank" size={24} />
          <Text style={[styles.navLabel, styles.navLabelActive]}>Épargne</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { gap: 20, padding: 16 },

  /* Header */
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  headerLeft: { alignItems: "center", flexDirection: "row", gap: 10 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: "600", color: colors.text },
  avatar: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 18, height: 36, justifyContent: "center", width: 36 },

  /* Main goal card */
  goalCard: {
    backgroundColor: "#EFF4FF",
    borderRadius: 16,
    gap: 12,
    overflow: "hidden",
    padding: 16,
  },
  goalDecorTop: {
    backgroundColor: `${colors.primary}0D`,
    borderRadius: 999,
    height: 160,
    position: "absolute",
    right: -48,
    top: -48,
    width: 160,
  },
  goalDecorBottom: {
    backgroundColor: "#865DD21A",
    borderRadius: 999,
    height: 128,
    position: "absolute",
    bottom: -32,
    left: -32,
    width: 128,
  },
  goalTop: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", position: "relative", zIndex: 1 },
  goalInfo: { alignItems: "center", flexDirection: "row", gap: 12 },
  goalIcon: { alignItems: "center", backgroundColor: "#584CB91A", borderRadius: 99, height: 48, justifyContent: "center", width: 48 },
  goalTitle: { color: colors.text, fontSize: 20, fontWeight: "600" },
  goalSub: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  editBtn: { alignItems: "center", backgroundColor: "#D3E4FE", borderRadius: 99, height: 32, justifyContent: "center", width: 32 },

  goalAmounts: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", position: "relative", zIndex: 1 },
  goalCurrentAmount: { color: colors.primary, fontSize: 48, fontWeight: "700", letterSpacing: -2, lineHeight: 56 },
  goalCurrency: { color: `${colors.primary}B3`, fontSize: 20, fontWeight: "600" },
  goalTargetCol: { alignItems: "flex-end" },
  goalTargetLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase" },
  goalTargetAmount: { color: colors.text, fontSize: 20, fontWeight: "600" },

  progressTrack: { backgroundColor: "#D3E4FE", borderRadius: 99, height: 12, overflow: "hidden", position: "relative", zIndex: 1 },
  progressFill: { backgroundColor: colors.primary, borderRadius: 99, height: "100%", position: "absolute", top: 0, left: 0 },
  progressMeta: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", position: "relative", zIndex: 1 },
  progressPct: { color: colors.primary, fontSize: 12, fontWeight: "500" },
  progressRemain: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },

  /* Acceleration card */
  accelCard: {
    backgroundColor: "#EBDCFF66",
    borderRadius: 16,
    overflow: "hidden",
    padding: 16,
  },
  accelDecor: { backgroundColor: "#D3BBFF0D", borderRadius: 999, bottom: -48, height: 120, position: "absolute", right: -48, width: 120 },
  accelContent: { gap: 12, position: "relative", zIndex: 1 },
  accelTop: { flexDirection: "row", justifyContent: "space-between" },
  accelTitleRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  accelTitle: { color: "#260059", fontSize: 18, fontWeight: "600" },
  accelDesc: { color: "#260059CC", fontSize: 16, lineHeight: 24, marginTop: 6 },
  accelBold: { color: "#260059", fontWeight: "700" },
  accelBadge: { backgroundColor: "#FFFFFF", borderRadius: 8, elevation: 2, marginLeft: 12, padding: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, alignItems: "center", minWidth: 72 },
  accelBadgeLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  accelBadgeValue: { color: colors.accent, fontSize: 18, fontWeight: "700" },
  accelBadgeUnit: { color: colors.textMuted, fontSize: 12, fontWeight: "400" },
  accelBtn: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 12,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
  },
  accelBtnText: { color: "#FFFBFF", fontSize: 14, fontWeight: "500" },

  /* Section */
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "600" },
  detailsBtn: { alignItems: "center", flexDirection: "row", gap: 2 },
  detailsBtnText: { color: colors.primary, fontSize: 12, fontWeight: "600" },

  /* Chart */
  chartCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
  },
  chartXAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingHorizontal: 4 },
  chartXLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "600" },
  chartLegend: { borderTopColor: "#E3E1ED", borderTopWidth: 1, flexDirection: "row", gap: 16, justifyContent: "flex-end", marginTop: 12, paddingTop: 8 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 6 },
  legendLine: { borderRadius: 4, height: 3, width: 12 },
  legendText: { color: colors.textMuted, fontSize: 10, fontWeight: "600" },

  /* Quick wins */
  quickWinsScroll: { gap: 12, paddingBottom: 4 },
  quickWinBadge: { backgroundColor: "#FFDAD6", borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 },
  quickWinBadgeText: { color: "#93000A", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  quickWinCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    elevation: 2,
    gap: 8,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    width: 240,
  },
  qwIcon: { alignItems: "center", borderRadius: 99, height: 40, justifyContent: "center", width: 40 },
  qwTitle: { color: colors.text, fontSize: 14, fontWeight: "500" },
  qwDesc: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  qwBtn: { borderRadius: 8, marginTop: "auto", paddingVertical: 8, alignItems: "center" },
  qwBtnText: { fontSize: 12, fontWeight: "500" },

  /* Bottom nav */
  bottomNav: { backgroundColor: "rgba(255,255,255,0.90)", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", paddingBottom: 8, paddingTop: 8 },
  navItem: { alignItems: "center", flex: 1, gap: 2, justifyContent: "center" },
  navItemActive: {},
  navLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  navLabelActive: { color: colors.primary },
});
