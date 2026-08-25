import React, { useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Animated,
  RefreshControl,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../../src/ui/theme";
import {router} from "expo-router";

/* ------------------------------------------------------------------ */
//  Types
/* ------------------------------------------------------------------ */

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type Category = {
  name: string;
  amount: number;
  icon: IconName;
  tint: string;
};

/* ------------------------------------------------------------------ */
//  Données
/* ------------------------------------------------------------------ */

const INCOME = 3200;

const CATEGORIES: Category[] = [
  { name: "Logement & Charges", amount: 1150, icon: "home", tint: colors.primary },
  { name: "Alimentation", amount: 480, icon: "food-variant", tint: "#7C3AED" },
  { name: "Transports", amount: 220, icon: "car", tint: "#0891B2" },
  { name: "Loisirs & Sorties", amount: 350, icon: "gamepad-variant", tint: "#E11D48" },
  { name: "Santé", amount: 90, icon: "medical-bag", tint: "#059669" },
  { name: "Épargne", amount: 400, icon: "piggy-bank", tint: "#D97706" },
];

/* ------------------------------------------------------------------ */
//  Helpers
/* ------------------------------------------------------------------ */

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("fr-FR").format(n) + " €";

/* ------------------------------------------------------------------ */
//  Animation d'entrée
/* ------------------------------------------------------------------ */

const FadeIn = ({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: any;
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 600,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 600,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
};

/* ------------------------------------------------------------------ */
//  Sous-composants
/* ------------------------------------------------------------------ */

const AnimatedBar = ({
  pct,
  color,
  delay = 0,
}: {
  pct: number;
  color: string;
  delay?: number;
}) => {
  const widthAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: pct,
      duration: 900,
      delay,
      useNativeDriver: false,
    }).start();
  }, [pct, delay, widthAnim]);

  return (
    <View style={styles.barTrack}>
      <Animated.View
        style={[
          styles.barFill,
          {
            backgroundColor: color,
            width: widthAnim.interpolate({
              inputRange: [0, 100],
              outputRange: ["0%", "100%"],
            }),
          },
        ]}
      />
    </View>
  );
};

const CategoryCard = ({
  cat,
  index,
  totalIncome,
  onPress,
}: {
  cat: Category;
  index: number;
  totalIncome: number;
  onPress?: () => void;
}) => {
  const pct = useMemo(
    () => Math.min((cat.amount / totalIncome) * 100, 100),
    [cat.amount, totalIncome]
  );

  return (
    <FadeIn delay={index * 90}>
      <Pressable
        onPress={() => {
        router.push({
          pathname: "/budget-details",
          params: {
            category: cat.name,
            amount: cat.amount.toString(),
            tint: cat.tint,
          },
        });
}}
        accessibilityLabel={`${cat.name}, ${formatCurrency(
          cat.amount
        )}, ${Math.round(pct)} pourcent du revenu`}
        accessibilityRole="button"
        accessibilityHint="Appuyez pour voir le détail"
      >
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View
              style={[styles.iconCircle, { backgroundColor: `${cat.tint}12` }]}
            >
              <MaterialCommunityIcons
                name={cat.icon}
                size={20}
                color={cat.tint}
              />
            </View>

            <View style={styles.cardMeta}>
              <Text style={styles.cardName}>{cat.name}</Text>
              <Text style={styles.cardPct}>
                {Math.round(pct)} % du revenu
              </Text>
            </View>

            <View style={styles.cardRight}>
              <Text style={styles.cardAmount}>
                {formatCurrency(cat.amount)}
              </Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={18}
                color={colors.textMuted}
              />
            </View>
          </View>

          <AnimatedBar pct={pct} color={cat.tint} delay={200 + index * 100} />
        </View>
      </Pressable>
    </FadeIn>
  );
};

/* ------------------------------------------------------------------ */
//  Page principale
/* ------------------------------------------------------------------ */

export default function Budget() {
  const [refreshing, setRefreshing] = useState(false);
  const [categories] = useState<Category[]>(CATEGORIES);

  const totalBudget = useMemo(
    () => categories.reduce((s, c) => s + c.amount, 0),
    [categories]
  );
  const remaining = INCOME - totalBudget;
  const usedPct = Math.min((totalBudget / INCOME) * 100, 100);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  const circleAnim = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(circleAnim, {
      toValue: usedPct,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [circleAnim, usedPct]);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Header ── */}
        <FadeIn delay={0}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerEyebrow}>Votre budget</Text>
              <Text style={styles.headerTitle}>Budget</Text>
            </View>
            <View style={styles.monthPill}>
              <Text style={styles.monthText}>Août 2026</Text>
            </View>
          </View>
        </FadeIn>

        {/* ── Hero ── */}
        <FadeIn delay={80}>
          <View style={styles.hero}>
            <View style={[styles.heroOrb, styles.heroOrb1]} />
            <View style={[styles.heroOrb, styles.heroOrb2]} />

            <View style={styles.heroContent}>
              <View style={styles.heroLeft}>
                <Text style={styles.heroLabel}>Total dépensé</Text>
                <Text style={styles.heroAmount}>
                  {formatCurrency(totalBudget)}
                </Text>
                <View style={styles.heroPill}>
                  <View
                    style={[
                      styles.heroDot,
                      {
                        backgroundColor:
                          remaining >= 0 ? colors.success : colors.danger,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.heroPillText,
                      {
                        color:
                          remaining >= 0 ? colors.success : colors.danger,
                      },
                    ]}
                  >
                    {remaining >= 0 ? "+" : ""}
                    {formatCurrency(remaining)} restants
                  </Text>
                </View>
              </View>

              <View style={styles.ringWrap}>
                <View style={styles.ringBg}>
                  <Animated.View
                    style={[
                      styles.ringFill,
                      {
                        borderBottomColor: colors.primary,
                        borderRightColor: colors.primary,
                        transform: [
                          {
                            rotate: circleAnim.interpolate({
                              inputRange: [0, 100],
                              outputRange: ["-135deg", "45deg"],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                </View>
                <View style={styles.ringCenter}>
                  <Text style={styles.ringPct}>{Math.round(usedPct)}%</Text>
                  <Text style={styles.ringLabel}>utilisé</Text>
                </View>
              </View>
            </View>
          </View>
        </FadeIn>

        {/* ── Section ── */}
        <FadeIn delay={160}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Répartition</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>
                {categories.length} catégories
              </Text>
            </View>
          </View>
        </FadeIn>

        {/* ── Liste ── */}
        <View style={styles.list}>
          {categories.map((cat, i) => (
            <CategoryCard
              key={cat.name}
              cat={cat}
              index={i}
              totalIncome={INCOME}
              onPress={() => {
                // TODO: Navigation détail catégorie
              }}
            />
          ))}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
//  Styles
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },

  /* Header */
  header: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
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
  monthPill: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  monthText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },

  /* Hero */
  hero: {
    backgroundColor: `${colors.primary}10`,
    borderRadius: 28,
    marginTop: 24,
    overflow: "hidden",
    padding: 24,
    position: "relative",
  },
  heroOrb: {
    borderRadius: 999,
    position: "absolute",
  },
  heroOrb1: {
    backgroundColor: `${colors.primary}12`,
    height: 180,
    right: -40,
    top: -60,
    width: 180,
  },
  heroOrb2: {
    backgroundColor: `${colors.primary}08`,
    bottom: -50,
    height: 140,
    left: -30,
    width: 140,
  },
  heroContent: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    position: "relative",
    zIndex: 1,
  },
  heroLeft: {
    flex: 1,
    gap: 6,
  },
  heroLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  heroAmount: {
    color: colors.text,
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -1,
    lineHeight: 40,
  },
  heroPill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.background,
    borderRadius: 99,
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroDot: {
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  heroPillText: {
    fontSize: 12,
    fontWeight: "700",
  },

  /* Ring */
  ringWrap: {
    alignItems: "center",
    height: 88,
    justifyContent: "center",
    width: 88,
  },
  ringBg: {
    borderColor: `${colors.text}12`,
    borderRadius: 999,
    borderWidth: 6,
    height: 88,
    position: "absolute",
    width: 88,
  },
  ringFill: {
    borderBottomColor: "transparent",
    borderBottomWidth: 6,
    borderLeftColor: "transparent",
    borderLeftWidth: 6,
    borderRadius: 999,
    borderRightColor: "transparent",
    borderRightWidth: 6,
    borderTopColor: "transparent",
    borderTopWidth: 6,
    height: 88,
    position: "absolute",
    width: 88,
  },
  ringCenter: {
    alignItems: "center",
  },
  ringPct: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  ringLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "600",
    marginTop: -2,
  },

  /* Section */
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
    marginTop: 32,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  countBadge: {
    backgroundColor: `${colors.primary}10`,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },

  /* Liste */
  list: {
    gap: 12,
  },

  /* Card */
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 0.5,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  cardTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
  },
  iconCircle: {
    alignItems: "center",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  cardMeta: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  cardPct: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
  cardRight: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 2,
  },
  cardAmount: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },

  /* Barre */
  barTrack: {
    backgroundColor: `${colors.text}08`,
    borderRadius: 99,
    height: 5,
    marginTop: 14,
    overflow: "hidden",
  },
  barFill: {
    borderRadius: 99,
    height: "100%",
  },
});