import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../../src/ui/theme";

const CATEGORIES = [
  { name: "Logement & Charges", amount: "1 150 €", icon: "home", tint: colors.primary, pct: "48%" },
  { name: "Alimentation", amount: "480 €", icon: "food-variant", tint: colors.accent, pct: "20%" },
  { name: "Transports", amount: "220 €", icon: "car", tint: colors.textMuted, pct: "9%" },
  { name: "Loisirs & Sorties", amount: "350 €", icon: "gamepad-variant", tint: "#E91E63", pct: "14%" },
] as const;

type Tab = "budget" | "ia";

export default function Budget() {
  const [tab, setTab] = useState<Tab>("budget");

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View style={styles.hero}>
          <View style={styles.heroBlur1} />
          <View style={styles.heroBlur2} />
          <View style={styles.heroInner}>
            <Text style={styles.heroLabel}>Budget Mensuel Total</Text>
            <Text style={styles.heroAmount}>2 400 €</Text>
            <Text style={styles.heroSub}>Revenus estimés : 3 200 €</Text>
          </View>
        </View>

        {/* Tab selector */}
        <View style={styles.tabBar}>
          <Pressable
            onPress={() => setTab("budget")}
            style={[styles.tab, tab === "budget" && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === "budget" && styles.tabTextActive]}>
              Mon Budget
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab("ia")}
            style={[styles.tab, tab === "ia" && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === "ia" && styles.tabTextActive]}>
              Proposition IA
            </Text>
          </Pressable>
        </View>

        {/* Section title */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Répartition actuelle</Text>
          <Pressable style={styles.modifierPill}>
            <Text style={styles.modifierPillText}>Modifier</Text>
          </Pressable>
        </View>

        {/* Categories card */}
        <View style={styles.categoriesCard}>
          {CATEGORIES.map((cat, i) => (
            <View key={cat.name}>
              <View style={styles.catRow}>
                <View style={styles.catLeft}>
                  <View style={[styles.catIcon, { backgroundColor: `${cat.tint}18` }]}>
                    <MaterialCommunityIcons color={cat.tint} name={cat.icon} size={18} />
                  </View>
                  <Text style={styles.catName}>{cat.name}</Text>
                </View>
                <Text style={styles.catAmount}>{cat.amount}</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { backgroundColor: cat.tint, width: cat.pct }]} />
              </View>
              {i < CATEGORIES.length - 1 && <View style={styles.catDivider} />}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { padding: 16, paddingBottom: 32 },

  /* Hero */
  hero: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    overflow: "hidden",
    padding: 16,
  },
  heroBlur1: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 999,
    height: 128,
    position: "absolute",
    right: -48,
    top: -48,
    width: 128,
  },
  heroBlur2: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 999,
    height: 96,
    position: "absolute",
    bottom: -32,
    left: -32,
    width: 96,
  },
  heroInner: { gap: 4, position: "relative", zIndex: 1 },
  heroLabel: {
    color: "rgba(255,255,255,0.80)",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  heroAmount: {
    color: "#FFFFFF",
    fontSize: 40,
    fontWeight: "700",
    lineHeight: 48,
    letterSpacing: -0.5,
  },
  heroSub: {
    color: "rgba(255,255,255,0.90)",
    fontSize: 16,
    marginTop: 4,
  },

  /* Tabs */
  tabBar: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 20,
    padding: 4,
  },
  tab: {
    borderRadius: 10,
    flex: 1,
    paddingVertical: 10,
  },
  tabActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  tabTextActive: {
    color: "#FFFFFF",
  },

  /* Section */
  sectionRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 24,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "600",
  },
  modifierPill: {
    backgroundColor: `${colors.primary}18`,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  modifierPillText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "500",
  },

  /* Categories card */
  categoriesCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  catRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  catLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  catIcon: {
    alignItems: "center",
    borderRadius: 99,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  catName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  catAmount: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  barTrack: {
    backgroundColor: `${colors.text}12`,
    borderRadius: 99,
    height: 8,
    marginTop: 8,
    overflow: "hidden",
  },
  barFill: {
    borderRadius: 99,
    height: "100%",
  },
  catDivider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 14,
  },
});
