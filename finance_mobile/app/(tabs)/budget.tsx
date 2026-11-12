import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, interFonts } from "../../src/ui/theme";
import { budget as budgetApi } from "../../src/shared/api/budget";
import { categories as categoriesApi } from "../../src/shared/api/categories";
import { useAppStore } from "../../src/shared/store";
import type { Budget, BudgetCategoryLine, BudgetSummary } from "../../src/shared/types";
import { formatMoney } from "../../src/shared/utils/money";
import { router, useFocusEffect } from "expo-router";
import { monthLabel } from "../../src/shared/utils/date";

/* ------------------------------------------------------------------ */
//  Types
/* ------------------------------------------------------------------ */

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type OptLevel = "low" | "medium" | "high";

type Category = {
  id?: string;
  categoryId?: string;
  name: string;
  amount: number;
  icon: IconName;
  tint: string;
  opt: OptLevel;
  active?: boolean;
  essential?: boolean;
  allocated?: number | null;
};

/* ------------------------------------------------------------------ */
//  Données
/* ------------------------------------------------------------------ */

const CATEGORY_ICONS: Record<string, IconName> = {
  "Logement": "home",
  "Logement & Charges": "home",
  Alimentation: "food-variant",
  Transports: "car",
  Transport: "car",
  "Loisirs & Sorties": "gamepad-variant",
  "Sorties & Loisirs": "ticket-confirmation-outline",
  Santé: "medical-bag",
  Abonnements: "wifi",
  Shopping: "shopping",
  Restaurants: "silverware-fork-knife",
  Épargne: "piggy-bank",
};

const ICON_FALLBACKS: IconName[] = [
  "tag-outline",
  "alien",
  "shape",
  "palette",
  "basket",
  "cash",
];

const CATEGORY_TINTS = [
  colors.primary,
  "#7C3AED",
  "#0891B2",
  "#E11D48",
  "#059669",
  "#D97706",
];

function categoryIcon(name: string, index: number): IconName {
  return CATEGORY_ICONS[name] ?? ICON_FALLBACKS[index % ICON_FALLBACKS.length];
}

function iconOf(saved: string | null | undefined, name: string, index: number): IconName {
  if (saved && saved in MaterialCommunityIcons.glyphMap) {
    return saved as IconName;
  }
  return categoryIcon(name, index);
}

function optOf(line: BudgetCategoryLine): OptLevel {
  if (line.reduction <= 0) return "low";
  const ratio = line.current > 0 ? line.reduction / line.current : 1;
  if (ratio >= 0.2) return "high";
  if (ratio >= 0.08) return "medium";
  return "low";
}

function optOfPotential(potential: string): OptLevel {
  if (potential === "HIGH") return "high";
  if (potential === "LOW") return "low";
  return "medium";
}

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
//  Barre "wavy" — Material 3 Expressive, animée à l'apparition
/* ------------------------------------------------------------------ */

let waveGradIdCounter = 0;

const AnimatedWaveBar = ({
  pct,
  color,
  delay = 0,
  height = 16,
}: {
  pct: number;
  color: string;
  delay?: number;
  height?: number;
}) => {
  const gradId = useRef(`wave-grad-${waveGradIdCounter++}`).current;
  const anim = useRef(new Animated.Value(0)).current;
  const [progress, setProgress] = useState(0); // 0 → pct (en %)

  React.useEffect(() => {
    anim.stopAnimation();
    const id = anim.addListener(({ value }) => setProgress(value));
    Animated.timing(anim, {
      toValue: pct,
      duration: 900,
      delay,
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [pct, delay, anim]);

  const width = 300; // unités du viewBox, s'étire sur 100% de la largeur réelle
  const amplitude = 3.5;
  const wavelength = 16;
  const midY = height / 2;
  const clamped = Math.min(Math.max(progress / 100, 0), 1);
  const splitX = clamped * width;

  const step = 3;
  const activePoints: string[] = [];
  for (let x = 0; x <= splitX; x += step) {
    const y = midY + amplitude * Math.sin((x / wavelength) * Math.PI * 2);
    activePoints.push(`${x.toFixed(1)},${y.toFixed(2)}`);
  }
  if (splitX > 0) {
    const y = midY + amplitude * Math.sin((splitX / wavelength) * Math.PI * 2);
    activePoints.push(`${splitX.toFixed(1)},${y.toFixed(2)}`);
  }
  const activePath = activePoints.length ? `M ${activePoints.join(" L ")}` : "";

  const restStartX = Math.min(splitX + 7, width - 4);
  const restPath = clamped < 1 ? `M ${restStartX},${midY} L ${width - 4},${midY}` : "";

  return (
    <View style={{ width: "100%", height, marginTop: 14 }}>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={`${color}88`} />
            <Stop offset="1" stopColor={color} />
          </LinearGradient>
        </Defs>

        {restPath !== "" && (
          <Path
            d={restPath}
            stroke={`${color}22`}
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
          />
        )}

        {activePath !== "" && (
          <Path
            d={activePath}
            stroke={`url(#${gradId})`}
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
          />
        )}

        {clamped < 1 && clamped > 0 && (
          <Circle cx={width - 3} cy={midY} r={2.5} fill={`${color}33`} />
        )}
      </Svg>
    </View>
  );
};

/* ------------------------------------------------------------------ */
//  Sous-composants
/* ------------------------------------------------------------------ */

const CategoryCard = ({
  cat,
  index,
  totalIncome,
  onToggle,
  onEdit,
}: {
  cat: Category;
  index: number;
  totalIncome: number;
  onToggle?: () => void;
  onEdit?: () => void;
}) => {
  const currency = useAppStore((s) => s.currency);
  const formatCurrency = (n: number) => formatMoney(n, currency);
  const allocated = cat.allocated && cat.allocated > 0 ? cat.allocated : null;
  const incomePct = useMemo(
    () => (totalIncome > 0 ? Math.min((cat.amount / totalIncome) * 100, 100) : 0),
    [cat.amount, totalIncome]
  );
  const barPct = useMemo(
    () => (allocated ? Math.min((cat.amount / allocated) * 100, 100) : incomePct),
    [cat.amount, allocated, incomePct]
  );
  const over = allocated !== null && cat.amount > allocated;
  const disabled = cat.active === false;

  return (
    <FadeIn delay={index * 90}>
      <Pressable
        onPress={() => {
        router.push({
          pathname: "/budget-details",
          params: {
            catId: cat.categoryId ?? cat.id ?? "",
            category: cat.name,
            amount: cat.amount.toString(),
            tint: cat.tint,
            opt: cat.opt,
            icon: cat.icon,
            allocated: cat.allocated ? cat.allocated.toString() : "0",
          },
        });
}}
        accessibilityLabel={`${cat.name}, budget ${formatCurrency(
          allocated ?? cat.amount
        )}, ${Math.round(barPct)} pourcent utilisé`}
        accessibilityRole="button"
        accessibilityHint="Appuyez pour voir le détail"
      >
        <View style={[styles.card, disabled && styles.cardDisabled]}>
          <View style={styles.cardTop}>
            <View
              style={[
                styles.iconCircle,
                {
                  backgroundColor: disabled
                    ? `${colors.textMuted}14`
                    : `${cat.tint}12`,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={disabled ? "eye-off-outline" : cat.icon}
                size={20}
                color={disabled ? colors.textMuted : cat.tint}
              />
            </View>

            <View style={styles.cardMeta}>
              <Text style={[styles.cardName, disabled && styles.cardTextMuted]}>
                {cat.name}
              </Text>
              <Text
                style={[
                  styles.cardPct,
                  disabled && { color: colors.textMuted },
                ]}
              >
                {disabled
                  ? "Catégorie désactivée"
                  : allocated
                  ? over
                    ? "Budget dépassé"
                    : `${Math.round(barPct)} % du budget alloué`
                  : `${Math.round(incomePct)} % du revenu`}
              </Text>
              {cat.essential === true && !disabled && (
                <View style={styles.cardEssential}>
                  <Text style={styles.cardEssentialText}>Essentielle</Text>
                </View>
              )}
            </View>

            <View style={styles.cardRight}>
              <Pressable
                onPress={onEdit}
                hitSlop={6}
                style={styles.cardEditBtn}
                accessibilityRole="button"
                accessibilityLabel={`Modifier ${cat.name}`}
                accessibilityHint="Ouvre le formulaire pour ajuster le budget alloué"
              >
                <MaterialCommunityIcons
                  name="pencil-outline"
                  size={16}
                  color={disabled ? colors.textMuted : colors.textMuted}
                />
              </Pressable>
              <Text
                style={[
                  styles.cardAmount,
                  disabled && styles.cardAmountDisabled,
                ]}
              >
                {formatCurrency(allocated ?? cat.amount)}
              </Text>
              <Toggle
                value={!disabled}
                onToggle={onToggle}
                label={`${disabled ? "Activer" : "Désactiver"} ${cat.name}`}
              />
            </View>
          </View>

          {!disabled && (
            <>
              {allocated !== null && (
                <View style={styles.cardAllocated}>
                  <Text style={styles.cardAllocatedText}>
                    Dépensé : {formatCurrency(cat.amount)}
                  </Text>
                  {over ? (
                    <Text style={styles.cardAllocatedOver}>
                      Dépassement de {formatCurrency(cat.amount - allocated)}
                    </Text>
                  ) : (
                    <Text style={styles.cardAllocatedText}>
                      Il reste {formatCurrency(allocated - cat.amount)}
                    </Text>
                  )}
                </View>
              )}
              <AnimatedWaveBar
                pct={barPct}
                color={over ? colors.danger : cat.tint}
                delay={200 + index * 100}
              />
            </>
          )}
        </View>
      </Pressable>
    </FadeIn>
  );
};

function Toggle({
  value,
  onToggle,
  label,
}: {
  value: boolean;
  onToggle?: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      style={[styles.toggle, value ? styles.toggleOn : styles.toggleOff]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <View style={styles.toggleDot} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
//  Anneau budgétaire (cercle complet, SVG)
/* ------------------------------------------------------------------ */

const RING = { size: 88, stroke: 6 };

function BudgetRing({ pct, color }: { pct: number; color?: string }) {
  const radius = (RING.size - RING.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const [dash, setDash] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    anim.stopAnimation();
    const id = anim.addListener(({ value }) => setDash(value * circumference));
    Animated.timing(anim, {
      toValue: Math.min(pct, 100) / 100,
      duration: 1100,
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [anim, pct, circumference]);

  return (
    <View style={styles.ringWrap}>
      <Svg height={RING.size} width={RING.size}>
        <Circle
          cx={RING.size / 2}
          cy={RING.size / 2}
          fill="none"
          r={radius}
          stroke={`${colors.text}12`}
          strokeWidth={RING.stroke}
        />
        <Circle
          cx={RING.size / 2}
          cy={RING.size / 2}
          fill="none"
          origin={`${RING.size / 2}, ${RING.size / 2}`}
          r={radius}
          rotation={-90}
          stroke={color ?? colors.primary}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference - dash}
          strokeLinecap="round"
          strokeWidth={RING.stroke}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringPct}>{Math.round(pct)}%</Text>
        <Text style={styles.ringLabel}>du budget</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
//  Page principale
/* ------------------------------------------------------------------ */

export default function Budget() {
  const userId = useAppStore((s) => s.userId);
  const currency = useAppStore((s) => s.currency);
  const period = useAppStore((s) => s.currentPeriod);

  const [data, setData] = useState<Budget | null>(null);
  const [decision, setDecision] = useState<BudgetSummary | null>(null);
  /** Budget déjà validé que l'utilisateur veut remplacer par la recommandation du jour. */
  const [reviewing, setReviewing] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  const formatCurrency = useCallback(
    (n: number) => formatMoney(n, currency),
    [currency]
  );

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      if (!userId) throw new Error("no-session");
      const [result, catPage, decisionRes] = await Promise.all([
        budgetApi.recommend(userId, period),
        categoriesApi.list(userId, { limit: 100 }),
        budgetApi.get(userId, period).catch(() => null),
      ]);
      setData(result);
      setDecision(decisionRes);

      const savedByKey = new Map(
        (catPage.items ?? []).map((c) => [c.name.toLowerCase(), c])
      );

      const lines: Category[] = result.categories.map((line, index) => {
        const saved = savedByKey.get(line.category_name.toLowerCase());
        return {
          id: saved?.id,
          categoryId: line.category_id,
          name: line.category_name,
          amount: line.current,
          icon: iconOf(saved?.icon, line.category_name, index),
          tint: saved?.color ?? CATEGORY_TINTS[index % CATEGORY_TINTS.length],
          opt: optOf(line),
          active: true,
          essential: line.essential,
          allocated: saved?.monthly_budget ?? null,
        };
      });

      const lineNames = new Set(lines.map((c) => c.name.toLowerCase()));
      const extra: Category[] = [];
      for (const c of catPage.items ?? []) {
        if (!c.active || lineNames.has(c.name.toLowerCase())) continue;
        const idx = lines.length + extra.length;
        extra.push({
          id: c.id,
          categoryId: c.id,
          name: c.name,
          amount: 0,
          icon: iconOf(c.icon, c.name, idx),
          tint: c.color ?? CATEGORY_TINTS[idx % CATEGORY_TINTS.length],
          opt: optOfPotential(c.optimization_potential),
          active: true,
          essential: c.essentiality === "ESSENTIAL",
          allocated: c.monthly_budget,
        });
      }
      setCategories([...lines, ...extra]);
    } catch {
      setData(null);
      setCategories([]);
    } finally {
      setRefreshing(false);
    }
  }, [userId, period]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleCategory = React.useCallback((name: string) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.name === name ? { ...c, active: c.active === false } : c
      )
    );
  }, []);

  const income = data?.projected_income ?? 0;
  const activeCategories = useMemo(
    () => categories.filter((c) => c.active !== false),
    [categories]
  );
  const totalSpent = useMemo(
    () => activeCategories.reduce((s, c) => s + c.amount, 0),
    [activeCategories]
  );
  const totalAllocated = useMemo(
    () => activeCategories.reduce((s, c) => s + (c.allocated ?? 0), 0),
    [activeCategories]
  );
  const allocatedRemaining = totalAllocated - totalSpent;
  const usedPct =
    totalAllocated > 0 ? Math.min((totalSpent / totalAllocated) * 100, 100) : 0;
  const ringColor = allocatedRemaining < 0 ? colors.danger : colors.primary;

  const onRefresh = React.useCallback(() => {
    load();
  }, [load]);

  const applyDecision = React.useCallback(async () => {
    if (!userId || !data) return;
    try {
      const res = await budgetApi.decide(userId, period, {
        accepted_total: data.recommended_expenses,
        accepted_savings: data.recommended_savings,
      });
      setDecision(res);
      setReviewing(false);
    } catch {
      Alert.alert(
        "Décision non enregistrée",
        "Vérifiez que le serveur est démarré et réessayez."
      );
    }
  }, [userId, period, data]);

  const handleCategorySaved = React.useCallback((cat: Category) => {
    setCategories((prev) => {
      if (cat.id && prev.some((c) => c.id === cat.id)) {
        return prev.map((c) => (c.id === cat.id ? cat : c));
      }
      return [...prev, cat];
    });
  }, []);

  const openCreate = React.useCallback(() => {
    setEditingCat(null);
    setAddModalVisible(true);
  }, []);

  const openEdit = React.useCallback((cat: Category) => {
    setEditingCat(cat);
    setAddModalVisible(true);
  }, []);

  if (refreshing && !data) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

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
              <Text style={styles.monthText}>{monthLabel(period)}</Text>
            </View>
          </View>
        </FadeIn>

        {activeCategories.length === 0 ? (
          <FadeIn delay={80}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <MaterialCommunityIcons
                  name="wallet-outline"
                  size={34}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.emptyTitle}>Aucun budget en cours</Text>
              <Text style={styles.emptySubtitle}>
                Aucune ligne budgétaire n'a été calculée pour{" "}
                {monthLabel(period)}. Ajoutez des dépenses ou créez une
                catégorie pour démarrer la répartition.
              </Text>
              <Pressable
                style={styles.emptyCta}
                onPress={openCreate}
                accessibilityLabel="Créer une catégorie"
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.emptyCtaText}>Créer une catégorie</Text>
              </Pressable>
            </View>
          </FadeIn>
        ) : (
          <>
            {/* ── Hero ── */}
            <FadeIn delay={80}>
              <View style={styles.hero}>
                <View style={[styles.heroOrb, styles.heroOrb1]} />
                <View style={[styles.heroOrb, styles.heroOrb2]} />

                <View style={styles.heroContent}>
                  <View style={styles.heroLeft}>
                    <Text style={styles.heroLabel}>Total alloué</Text>
                    <Text style={styles.heroAmount}>
                      {formatCurrency(totalAllocated)}
                    </Text>
                    <View style={styles.heroRow}>
                      <Text style={styles.heroSpent}>
                        Dépensé : {formatCurrency(totalSpent)}
                      </Text>
                      <View style={[styles.heroPill, styles.heroPillNarrow]}>
                        <View
                          style={[
                            styles.heroDot,
                            {
                              backgroundColor:
                                allocatedRemaining >= 0
                                  ? colors.success
                                  : colors.danger,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.heroPillText,
                            {
                              color:
                                allocatedRemaining >= 0
                                  ? colors.success
                                  : colors.danger,
                            },
                          ]}
                        >
                          {allocatedRemaining >= 0
                            ? `Il reste ${formatCurrency(allocatedRemaining)}`
                            : `Dépassement de ${formatCurrency(
                                -allocatedRemaining
                              )}`}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <BudgetRing pct={usedPct} color={ringColor} />
                </View>
              </View>
            </FadeIn>

            {/* ── Décision budgétaire ── */}
            {data && (
              <FadeIn delay={140}>
                <View style={styles.decisionCard}>
                  <View pointerEvents="none" style={[styles.heroOrb, styles.decisionOrb1]} />
                  <View pointerEvents="none" style={[styles.heroOrb, styles.decisionOrb2]} />
                  <View pointerEvents="none" style={[styles.heroOrb, styles.decisionOrb3]} />
                  <View style={styles.decisionHeader}>
                    <Text style={styles.decisionTitle}>
                      {decision?.accepted_total != null && !reviewing
                        ? "Décision enregistrée"
                        : "Recommandation budgétaire"}
                    </Text>
                    {decision?.accepted_total != null ? (
                      <Pressable
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={() => setReviewing((v) => !v)}
                        style={styles.reviewLink}
                      >
                        <Text style={styles.reviewLinkText}>{reviewing ? "Annuler" : "Revoir"}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {decision?.accepted_total != null && !reviewing ? (
                    <Text style={styles.decisionText}>
                      {formatCurrency(decision.accepted_total)} de dépenses
                      validées, soit {formatCurrency(decision.accepted_savings ?? 0)}{" "}
                      d'épargne par mois.
                    </Text>
                  ) : (
                    <>
                      {reviewing && decision?.accepted_total != null ? (
                        <Text style={styles.decisionText}>
                          Budget actuel : {formatCurrency(decision.accepted_total)} de dépenses. Il sera
                          remplacé par la recommandation du jour.
                        </Text>
                      ) : null}
                      <Text style={styles.decisionText}>
                        Validez la répartition recommandée :{" "}
                        {formatCurrency(data.recommended_expenses)} de dépenses
                        et {formatCurrency(data.recommended_savings)} d'épargne
                        par mois.
                      </Text>
                      <Pressable
                        style={styles.decisionBtn}
                        onPress={() => void applyDecision()}
                        accessibilityLabel="Valider la recommandation budgétaire"
                        accessibilityRole="button"
                      >
                        <MaterialCommunityIcons
                          name="check-decagram"
                          size={16}
                          color="#FFFFFF"
                        />
                        <Text style={styles.decisionBtnText}>
                          Valider la recommandation
                        </Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </FadeIn>
            )}

            {/* ── Section ── */}
            <FadeIn delay={160}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Répartition</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>
                    {categories.length} catégories
                  </Text>
                </View>
                <Pressable
                  style={styles.addCatBtn}
                  onPress={openCreate}
                  accessibilityLabel="Ajouter une catégorie"
                  accessibilityRole="button"
                  accessibilityHint="Ouvre le formulaire de création d'une catégorie"
                >
                  <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                  <Text style={styles.addCatText}>Ajouter</Text>
                </Pressable>
              </View>
            </FadeIn>

            {/* ── Liste ── */}
            <View style={styles.list}>
              {categories.map((cat, i) => (
                <CategoryCard
                  key={cat.id ?? cat.name}
                  cat={cat}
                  index={i}
                  totalIncome={income}
                  onToggle={() => toggleCategory(cat.name)}
                  onEdit={() => openEdit(cat)}
                />
              ))}
            </View>
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      <AddCategoryModal
        visible={addModalVisible}
        userId={userId}
        currency={currency}
        editing={editingCat}
        onClose={() => {
          setAddModalVisible(false);
          setEditingCat(null);
        }}
        onSave={handleCategorySaved}
      />
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
//  Modal Ajouter une catégorie
/* ------------------------------------------------------------------ */

const ICON_CHOICES: IconName[] = [
  "silverware-fork-knife",
  "car",
  "gamepad-variant",
  "shopping",
  "receipt",
  "home",
  "medical-bag",
  "briefcase",
  "tshirt-crew",
  "paw",
];

const TINT_CHOICES = [
  colors.primary,
  "#7C3AED",
  "#0891B2",
  "#E11D48",
  "#059669",
  "#D97706",
];

type AddCategoryModalProps = {
  visible: boolean;
  userId: string | null;
  currency: string;
  editing: Category | null;
  onClose: () => void;
  onSave: (cat: Category) => void;
};

function AddCategoryModal({
  visible,
  userId,
  currency,
  editing,
  onClose,
  onSave,
}: AddCategoryModalProps) {
  const [name, setName] = useState("");
  const [amountText, setAmountText] = useState("");
  const [icon, setIcon] = useState<IconName>(ICON_CHOICES[0]);
  const [tint, setTint] = useState(TINT_CHOICES[0]);
  const [essential, setEssential] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const amount = parseFloat(amountText.replace(",", "."));
  const canSave =
    name.trim().length > 0 &&
    Number.isFinite(amount) &&
    amount > 0 &&
    !saving;

  async function handleSave() {
    if (!canSave) return;
    if (!userId) {
      setSaveError("Session non initialisée. Repassez par l'onboarding.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const monthlyBudget = Math.round(amount * 100) / 100;
    try {
      if (editing?.id) {
        await categoriesApi.update(userId, editing.id, {
          name: name.trim(),
          essentiality: essential ? "ESSENTIAL" : "NON_ESSENTIAL",
          optimization_potential: "MEDIUM",
          monthly_budget: monthlyBudget,
          icon,
          color: tint,
        });
        onSave({
          ...editing,
          name: name.trim(),
          icon,
          tint,
          essential,
          allocated: monthlyBudget,
        });
      } else {
        const created = await categoriesApi.create(userId, {
          name: name.trim(),
          essentiality: essential ? "ESSENTIAL" : "NON_ESSENTIAL",
          optimization_potential: "MEDIUM",
          monthly_budget: monthlyBudget,
          icon,
          color: tint,
        });
        onSave({
          id: created.id,
          categoryId: created.id,
          name: created.name,
          amount: 0,
          icon,
          tint,
          opt: "medium",
          active: created.active,
          essential: created.essentiality === "ESSENTIAL",
          allocated: created.monthly_budget,
        });
      }
      onClose();
    } catch {
      setSaveError(
        editing?.id
          ? "Impossible d'enregistrer la catégorie. Vérifiez que le serveur est démarré."
          : "Impossible de créer la catégorie. Vérifiez que le serveur est démarré."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => {
        if (editing) {
          setName(editing.name);
          setAmountText(editing.allocated ? String(editing.allocated) : "");
          setIcon(
            editing.icon && editing.icon in MaterialCommunityIcons.glyphMap
              ? (editing.icon as IconName)
              : ICON_CHOICES[0]
          );
          setTint(TINT_CHOICES.includes(editing.tint)
            ? editing.tint
            : TINT_CHOICES[0]);
          setEssential(editing.essential === true);
        } else {
          setName("");
          setAmountText("");
          setIcon(ICON_CHOICES[0]);
          setTint(TINT_CHOICES[0]);
          setEssential(false);
        }
        setSaveError(null);
      }}
    >
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalKeyboard}
        >
          <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>
            {editing ? "Modifier la catégorie" : "Nouvelle catégorie"}
          </Text>

          <Text style={styles.fieldLabel}>Nom de la catégorie</Text>
          <TextInput
            style={styles.fieldInput}
            value={name}
            onChangeText={setName}
            placeholder="Ex : Abonnements"
            placeholderTextColor={`${colors.textMuted}80`}
          />

          <Text style={styles.fieldLabel}>Budget mensuel ({currency})</Text>
          <TextInput
            style={styles.fieldInput}
            value={amountText}
            onChangeText={(t) => setAmountText(t.replace(/[^0-9,]/g, ""))}
            placeholder="Ex : 150000"
            placeholderTextColor={`${colors.textMuted}80`}
            keyboardType="numeric"
          />
          <Text style={styles.fieldHint}>
            Ce montant est votre répartition mensuelle pour cette catégorie. Il
            apparaît sur la carte et est comparé à vos dépenses du mois.
          </Text>

          <Text style={styles.fieldLabel}>Type de catégorie</Text>
          <View style={styles.essentialRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: !essential }}
              onPress={() => setEssential(false)}
              style={[
                styles.essentialOpt,
                !essential && styles.essentialOptActive,
              ]}
            >
              <Text
                style={[
                  styles.essentialOptText,
                  !essential && styles.essentialOptTextActive,
                ]}
              >
                Non-essentielle
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: essential }}
              onPress={() => setEssential(true)}
              style={[
                styles.essentialOpt,
                essential && styles.essentialOptActive,
              ]}
            >
              <Text
                style={[
                  styles.essentialOptText,
                  essential && styles.essentialOptTextActive,
                ]}
              >
                Essentielle
              </Text>
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>Icône</Text>
          <View style={styles.iconRow}>
            {ICON_CHOICES.map((ic) => {
              const active = ic === icon;
              return (
                <Pressable
                  key={ic}
                  onPress={() => setIcon(ic)}
                  style={[
                    styles.iconChoice,
                    active && styles.iconChoiceActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={ic}
                    size={20}
                    color={active ? colors.primary : colors.textMuted}
                  />
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Couleur</Text>
          <View style={styles.swatchRow}>
            {TINT_CHOICES.map((c) => {
              const active = c === tint;
              return (
                <Pressable
                  key={c}
                  onPress={() => setTint(c)}
                  style={[styles.swatch, { backgroundColor: c }]}
                  accessibilityLabel={`Couleur ${c}`}
                >
                  {active && (
                    <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
                  )}
                </Pressable>
              );
            })}
          </View>

          {saveError && (
            <Text style={styles.fieldError} accessibilityLiveRegion="polite">
              {saveError}
            </Text>
          )}
          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancel} onPress={onClose}>
              <Text style={styles.modalCancelText}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[styles.modalSave, { opacity: canSave ? 1 : 0.5 }]}
              onPress={handleSave}
              disabled={!canSave}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.modalSaveText}>
                  {editing ? "Enregistrer" : "Ajouter"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },

  /* Etat vide */
  emptyCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 24,
    padding: 28,
  },
  emptyIconWrap: {
    alignItems: "center",
    backgroundColor: `${colors.primary}12`,
    borderRadius: 99,
    height: 72,
    justifyContent: "center",
    marginBottom: 14,
    width: 72,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontFamily: interFonts.bold,
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 12, fontFamily: interFonts.regular,
    lineHeight: 18,
    marginTop: 8,
    textAlign: "center",
  },
  emptyCta: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 99,
    flexDirection: "row",
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  emptyCtaText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: interFonts.bold,
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
    fontSize: 11,
    fontFamily: interFonts.semibold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  headerTitle: {
    color: colors.text,
    fontSize: 29,
    fontFamily: interFonts.bold,
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
    fontSize: 12,
    fontFamily: interFonts.semibold,
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
    fontSize: 12,
    fontFamily: interFonts.medium,
    letterSpacing: 0.5,
  },
  heroAmount: {
    color: colors.text,
    fontSize: 33,
    fontFamily: interFonts.bold,
    letterSpacing: -1,
    lineHeight: 37,
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
    fontSize: 11,
    fontFamily: interFonts.bold,
  },
  heroRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  heroSpent: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: interFonts.semibold,
  },
  heroPillNarrow: {
    marginTop: 0,
    paddingVertical: 4,
  },

  /* Décision budgétaire */
  decisionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    marginTop: 14,
    overflow: "hidden",
    padding: 16,
    position: "relative",
  },
  reviewLink: { marginLeft: "auto" },
  reviewLinkText: { color: colors.primary, fontFamily: interFonts.semibold, fontSize: 13 },
  decisionOrb1: {
    backgroundColor: `${colors.primary}10`,
    height: 120,
    right: -36,
    top: -48,
    width: 120,
  },
  decisionOrb2: {
    backgroundColor: `${colors.primary}08`,
    bottom: -40,
    height: 90,
    left: -28,
    width: 90,
  },
  decisionOrb3: {
    backgroundColor: `${colors.primary}0D`,
    bottom: -22,
    height: 54,
    left: 40,
    width: 54,
  },
  decisionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  decisionTitle: {
    color: colors.text,
    fontSize: 13,
    fontFamily: interFonts.bold,
  },
  decisionText: {
    color: colors.textMuted,
    fontSize: 12, fontFamily: interFonts.regular,
    lineHeight: 17,
  },
  decisionBtn: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 99,
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  decisionBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: interFonts.bold,
  },

  /* Ring */
  ringWrap: {
    height: RING.size,
    position: "relative",
    width: RING.size,
  },
  ringCenter: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  ringPct: {
    color: colors.text,
    fontSize: 15,
    fontFamily: interFonts.bold,
  },
  ringLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontFamily: interFonts.semibold,
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
    fontSize: 18,
    fontFamily: interFonts.bold,
  },
  countBadge: {
    backgroundColor: `${colors.primary}10`,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countText: {
    color: colors.primary,
    fontSize: 11,
    fontFamily: interFonts.bold,
  },
  addCatBtn: {
    alignItems: "center",
    backgroundColor: `${colors.primary}12`,
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    marginLeft: "auto",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addCatText: { color: colors.primary, fontSize: 12, fontFamily: interFonts.bold },

  /* Modal */
  modalBackdrop: {
    backgroundColor: "rgba(11,28,48,0.45)",
    flex: 1,
    justifyContent: "flex-end",
  },
  modalKeyboard: { flex: 1, justifyContent: "flex-end" },
  modalDismiss: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 32,
  },
  modalHandle: {
    alignSelf: "center",
    backgroundColor: colors.border,
    borderRadius: 99,
    height: 4,
    marginBottom: 16,
    width: 44,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontFamily: interFonts.bold,
    marginBottom: 8,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: interFonts.semibold,
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 14,
    textTransform: "uppercase",
  },
  fieldInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15, fontFamily: interFonts.regular,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fieldHint: {
    color: colors.textMuted,
    fontSize: 11, fontFamily: interFonts.regular,
    lineHeight: 15,
    marginTop: 6,
  },
  fieldError: {
    color: colors.danger,
    fontSize: 12,
    fontFamily: interFonts.semibold,
    marginTop: 12,
  },
  essentialRow: { flexDirection: "row", gap: 10 },
  essentialOpt: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 12,
  },
  essentialOptActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 2,
    paddingVertical: 11,
  },
  essentialOptText: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: interFonts.semibold,
    textAlign: "center",
  },
  essentialOptTextActive: { color: colors.primary, fontFamily: interFonts.bold },
  iconRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  iconChoice: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: 99,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  iconChoiceActive: {
    backgroundColor: `${colors.primary}18`,
    borderColor: colors.primary,
  },
  swatchRow: { flexDirection: "row", gap: 10 },
  swatch: {
    alignItems: "center",
    borderRadius: 99,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 24 },
  modalCancel: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    flex: 1,
    justifyContent: "center",
    paddingVertical: 14,
  },
  modalCancelText: { color: colors.text, fontSize: 15, fontFamily: interFonts.bold },
  modalSave: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 14,
    flex: 1,
    justifyContent: "center",
    paddingVertical: 14,
  },
  modalSaveText: { color: "#FFFFFF", fontSize: 15, fontFamily: interFonts.bold },

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
  cardDisabled: { opacity: 0.6 },
  cardTextMuted: { color: colors.textMuted },
  cardAmountDisabled: {
    color: colors.textMuted,
    textDecorationLine: "line-through",
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
    fontSize: 14,
    fontFamily: interFonts.semibold,
  },
  cardPct: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: interFonts.medium,
  },
  cardEssential: {
    alignSelf: "flex-start",
    backgroundColor: `${colors.primary}14`,
    borderRadius: 99,
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  cardEssentialText: {
    color: colors.primary,
    fontSize: 10,
    fontFamily: interFonts.bold,
  },
  cardRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  cardEditBtn: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 99,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  cardAllocated: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  cardAllocatedText: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: interFonts.semibold,
  },
  cardAllocatedOver: {
    color: colors.danger,
    fontSize: 11,
    fontFamily: interFonts.bold,
  },
  cardAmount: {
    color: colors.text,
    fontSize: 14,
    fontFamily: interFonts.bold,
  },

  /* Toggle */
  toggle: {
    alignItems: "center",
    borderRadius: 99,
    flexDirection: "row",
    height: 26,
    padding: 3,
    width: 46,
  },
  toggleOff: { backgroundColor: "#C8CFE3" },
  toggleOn: {
    backgroundColor: colors.primary,
    justifyContent: "flex-end",
  },
  toggleDot: {
    backgroundColor: "#FFFFFF",
    borderRadius: 99,
    height: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    width: 20,
  },
});