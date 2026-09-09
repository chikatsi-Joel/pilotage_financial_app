import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import {
  ProgressBar,
  SearchBar,
} from "../../src/ui/components";
import { colors } from "../../src/ui/theme";

const TRANSACTIONS = [
  {
    day: "Aujourd'hui, 24 Octobre",
    dayTotal: "-142.50",
    items: [
      {
        title: "Monoprix - Courses",
        category: "Alimentation",
        amount: "-85.20",
        pill: "Essentielle",
        pillBg: "#DCE9FF",
        pillColor: colors.text,
        icon: "cart",
        iconBg: "#E3E1ED",
        iconColor: "#64636D",
        hasAccentBar: false,
      },
      {
        title: "Restaurant Le Petit Chef",
        category: "Sorties & Loisirs",
        amount: "-45.00",
        pill: "Optimisable",
        pillBg: "#D3BBFF30",
        pillColor: colors.accent,
        icon: "silverware-fork-knife",
        iconBg: "#865DD220",
        iconColor: colors.accent,
        hasAccentBar: false,
      },
      {
        title: "Total Energies",
        category: "Transport",
        amount: "-12.30",
        pill: "Essentielle",
        pillBg: "#DCE9FF",
        pillColor: colors.text,
        icon: "gas-station",
        iconBg: "#E3E1ED",
        iconColor: "#64636D",
        hasAccentBar: false,
      },
    ],
  },
  {
    day: "Hier, 23 Octobre",
    dayTotal: "-1 200.00",
    items: [
      {
        title: "Loyer Appartement",
        category: "Logement",
        amount: "-1 200.00",
        pill: "Essentielle",
        pillBg: "#DCE9FF",
        pillColor: colors.text,
        icon: "home",
        iconBg: `${colors.primary}18`,
        iconColor: colors.primary,
        hasAccentBar: true,
      },
    ],
  },
] as const;

export default function Depenses() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>Vos dépenses</Text>
          <Text style={styles.headerTitle}>Dépenses</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.analyseBtn}
            onPress={() => router.push("/analyse-insights")}
            hitSlop={6}
            accessibilityLabel="Ouvrir la page Analyse"
            accessibilityRole="button"
          >
            <MaterialCommunityIcons
              color={colors.primary}
              name="chart-timeline-variant-shimmer"
              size={16}
            />
            <Text style={styles.analyseBtnText}>Analyse</Text>
          </Pressable>
          <View style={styles.avatar}>
            <MaterialCommunityIcons color="#FFFFFF" name="account" size={18} />
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Search bar ── */}
        <SearchBar
          placeholder="Rechercher une transaction..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFilterPress={() => {}}
        />

        {/* ── Résumé du mois ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Résumé du mois</Text>
          <Pressable
            style={styles.addCatBtn}
            onPress={() => router.push("/add-expense")}
            hitSlop={6}
            accessibilityLabel="Ajouter une dépense"
            accessibilityRole="button"
          >
            <MaterialCommunityIcons color={colors.primary} name="plus" size={16} />
            <Text style={styles.addCatText}>Ajouter</Text>
          </Pressable>
        </View>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryDecor} />
            <View style={styles.summaryIconRow}>
              <MaterialCommunityIcons
                color={colors.primary}
                name="check-decagram"
                size={16}
              />
              <Text style={styles.summaryLabel}>Essentielles</Text>
            </View>
            <Text style={styles.summaryValue}>1 240 €</Text>
            <ProgressBar
              progress={75}
              height={4}
              color={colors.primary}
              trackColor="#D3E4FE"
              style={{ marginTop: 4 }}
            />
          </View>
          <View style={[styles.summaryCard, styles.summaryCardTertiary]}>
            <View style={styles.summaryDecorTertiary} />
            <View style={styles.summaryIconRow}>
              <MaterialCommunityIcons
                color={colors.accent}
                name="trending-down"
                size={16}
              />
              <Text style={[styles.summaryLabel, { color: colors.accent }]}>
                Optimisables
              </Text>
            </View>
            <Text style={styles.summaryValue}>450 €</Text>
            <ProgressBar
              progress={40}
              height={4}
              color={colors.accent}
              trackColor="#D3BBFF40"
              style={{ marginTop: 4 }}
            />
          </View>
        </View>

        {/* ── Transactions grouped by day ── */}
        {TRANSACTIONS.map((group) => (
          <View key={group.day} style={styles.dayGroup}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayLabel}>{group.day}</Text>
              <Text style={styles.dayTotal}>{group.dayTotal} €</Text>
            </View>
            <View style={styles.txList}>
              {group.items.map((tx) => (
                <View key={tx.title} style={styles.txCard}>
                  {tx.hasAccentBar && <View style={styles.accentBar} />}
                  <View
                    style={[
                      styles.txIcon,
                      { backgroundColor: tx.iconBg },
                      tx.hasAccentBar && styles.txIconShifted,
                    ]}
                  >
                    <MaterialCommunityIcons
                      color={tx.iconColor}
                      name={tx.icon as any}
                      size={22}
                    />
                  </View>
                  <View style={styles.txContent}>
                    <Text style={styles.txTitle} numberOfLines={1}>
                      {tx.title}
                    </Text>
                    <Text style={styles.txCategory} numberOfLines={1}>
                      {tx.category}
                    </Text>
                  </View>
                  <View style={styles.txRight}>
                    <Text style={styles.txAmount}>{tx.amount} €</Text>
                    <View
                      style={[styles.txPill, { backgroundColor: tx.pillBg }]}
                    >
                      <Text style={[styles.txPillText, { color: tx.pillColor }]}>
                        {tx.pill}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={{ height: 24 }} />
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },

  header: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerEyebrow: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  headerTitle: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 2,
  },

  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },

  headerRight: { alignItems: "center", flexDirection: "row", gap: 10 },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  addCatBtn: {
    alignItems: "center",
    backgroundColor: `${colors.primary}12`,
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addCatText: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  analyseBtn: {
    alignItems: "center",
    backgroundColor: `${colors.primary}1A`,
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  analyseBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700",
  },

  content: { gap: 16, padding: 16, paddingTop: 38 },

  /* Summary */
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 4,
  },
  summaryGrid: { flexDirection: "row", gap: 12 },
  summaryCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    flex: 1,
    gap: 6,
    overflow: "hidden",
    padding: 14,
  },
  summaryCardTertiary: { backgroundColor: "#D3BBFF20" },
  summaryDecor: {
    backgroundColor: `${colors.primary}08`,
    borderRadius: 99,
    height: 80,
    position: "absolute",
    right: -16,
    top: -16,
    width: 80,
  },
  summaryDecorTertiary: {
    backgroundColor: `${colors.accent}10`,
    borderRadius: 99,
    height: 80,
    position: "absolute",
    right: -16,
    top: -16,
    width: 80,
  },
  summaryIconRow: { alignItems: "center", flexDirection: "row", gap: 4 },
  summaryLabel: { color: colors.text, fontSize: 13, fontWeight: "500" },
  summaryValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 28,
  },

  /* Day groups */
  dayGroup: { gap: 10 },
  dayHeader: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dayLabel: { color: colors.textMuted, fontSize: 14, fontWeight: "500" },
  dayTotal: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },

  /* Transactions */
  txList: { gap: 10 },
  txCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  accentBar: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 12,
    borderLeftWidth: 4,
    borderColor: colors.primary,
    borderTopLeftRadius: 12,
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
  },
  txIcon: {
    alignItems: "center",
    borderRadius: 99,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  txIconShifted: { marginLeft: 4 },
  txContent: { flex: 1, gap: 2, minWidth: 0 },
  txTitle: { color: colors.text, fontSize: 16, fontWeight: "400" },
  txCategory: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  txRight: { alignItems: "flex-end", gap: 4 },
  txAmount: { color: colors.text, fontSize: 16, fontWeight: "600" },
  txPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  txPillText: { fontSize: 12, fontWeight: "600" },

  /* Bottom nav */
  bottomNav: {
    backgroundColor: "rgba(255,255,255,0.90)",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    paddingBottom: 8,
    paddingTop: 8,
  },
  navItem: { alignItems: "center", flex: 1, gap: 2, justifyContent: "center" },
  navLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  navLabelActive: { color: colors.primary },
});