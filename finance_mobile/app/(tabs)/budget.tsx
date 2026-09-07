import React, { useMemo, useRef, useState } from "react";
import {
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
import Svg, { Circle } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../../src/ui/theme";
import {router} from "expo-router";

/* ------------------------------------------------------------------ */
//  Types
/* ------------------------------------------------------------------ */

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type OptLevel = "low" | "medium" | "high";

type Category = {
  name: string;
  amount: number;
  icon: IconName;
  tint: string;
  opt: OptLevel;
  active?: boolean;
};

/* ------------------------------------------------------------------ */
//  Données
/* ------------------------------------------------------------------ */

const INCOME = 3200;

const CATEGORIES: Category[] = [
  { name: "Logement & Charges", amount: 1150, icon: "home", tint: colors.primary, opt: "medium" },
  { name: "Alimentation", amount: 480, icon: "food-variant", tint: "#7C3AED", opt: "low" },
  { name: "Transports", amount: 220, icon: "car", tint: "#0891B2", opt: "medium" },
  { name: "Loisirs & Sorties", amount: 350, icon: "gamepad-variant", tint: "#E11D48", opt: "high" },
  { name: "Santé", amount: 90, icon: "medical-bag", tint: "#059669", opt: "low" },
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
  onToggle,
}: {
  cat: Category;
  index: number;
  totalIncome: number;
  onToggle?: () => void;
}) => {
  const pct = useMemo(
    () => Math.min((cat.amount / totalIncome) * 100, 100),
    [cat.amount, totalIncome]
  );
  const disabled = cat.active === false;

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
            opt: cat.opt,
          },
        });
}}
        accessibilityLabel={`${cat.name}, ${formatCurrency(
          cat.amount
        )}, ${Math.round(pct)} pourcent du revenu`}
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
                {disabled ? "Catégorie désactivée" : `${Math.round(pct)} % du revenu`}
              </Text>
            </View>

            <View style={styles.cardRight}>
              <Text
                style={[
                  styles.cardAmount,
                  disabled && styles.cardAmountDisabled,
                ]}
              >
                {formatCurrency(cat.amount)}
              </Text>
              <Toggle
                value={!disabled}
                onToggle={onToggle}
                label={`${disabled ? "Activer" : "Désactiver"} ${cat.name}`}
              />
            </View>
          </View>

          {!disabled && (
            <AnimatedBar pct={pct} color={cat.tint} delay={200 + index * 100} />
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

function BudgetRing({ pct }: { pct: number }) {
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
          stroke={colors.primary}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference - dash}
          strokeLinecap="round"
          strokeWidth={RING.stroke}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringPct}>{Math.round(pct)}%</Text>
        <Text style={styles.ringLabel}>utilisé</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
//  Page principale
/* ------------------------------------------------------------------ */

export default function Budget() {
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<Category[]>(CATEGORIES);
  const [addModalVisible, setAddModalVisible] = useState(false);

  const toggleCategory = React.useCallback((name: string) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.name === name ? { ...c, active: c.active === false } : c
      )
    );
  }, []);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.active !== false),
    [categories]
  );
  const totalBudget = useMemo(
    () => activeCategories.reduce((s, c) => s + c.amount, 0),
    [activeCategories]
  );
  const remaining = INCOME - totalBudget;
  const usedPct = Math.min((totalBudget / INCOME) * 100, 100);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

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

              <BudgetRing pct={usedPct} />
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
            <Pressable
              style={styles.addCatBtn}
              onPress={() => setAddModalVisible(true)}
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
              key={cat.name}
              cat={cat}
              index={i}
              totalIncome={INCOME}
              onToggle={() => toggleCategory(cat.name)}
            />
          ))}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <AddCategoryModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onAdd={(cat) => setCategories((prev) => [...prev, cat])}
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
  onClose: () => void;
  onAdd: (cat: Category) => void;
};

function AddCategoryModal({ visible, onClose, onAdd }: AddCategoryModalProps) {
  const [name, setName] = useState("");
  const [amountText, setAmountText] = useState("");
  const [icon, setIcon] = useState<IconName>(ICON_CHOICES[0]);
  const [tint, setTint] = useState(TINT_CHOICES[0]);

  const amount = parseFloat(amountText.replace(",", "."));
  const canSave = name.trim().length > 0 && Number.isFinite(amount) && amount > 0;

  function handleSave() {
    if (!canSave) return;
    onAdd({
      name: name.trim(),
      amount: Math.round(amount * 100) / 100,
      icon,
      tint,
      opt: "medium",
    });
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => {
        setName("");
        setAmountText("");
        setIcon(ICON_CHOICES[0]);
        setTint(TINT_CHOICES[0]);
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
          <Text style={styles.modalTitle}>Nouvelle catégorie</Text>

          <Text style={styles.fieldLabel}>Nom de la catégorie</Text>
          <TextInput
            style={styles.fieldInput}
            value={name}
            onChangeText={setName}
            placeholder="Ex : Abonnements"
            placeholderTextColor={`${colors.textMuted}80`}
          />

          <Text style={styles.fieldLabel}>Budget mensuel (€)</Text>
          <TextInput
            style={styles.fieldInput}
            value={amountText}
            onChangeText={(t) => setAmountText(t.replace(/[^0-9,]/g, ""))}
            placeholder="Ex : 150"
            placeholderTextColor={`${colors.textMuted}80`}
            keyboardType="numeric"
          />

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

          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancel} onPress={onClose}>
              <Text style={styles.modalCancelText}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[styles.modalSave, { opacity: canSave ? 1 : 0.5 }]}
              onPress={handleSave}
              disabled={!canSave}
            >
              <Text style={styles.modalSaveText}>Ajouter</Text>
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
  addCatText: { color: colors.primary, fontSize: 13, fontWeight: "700" },

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
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
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
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
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
  modalCancelText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  modalSave: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 14,
    flex: 1,
    justifyContent: "center",
    paddingVertical: 14,
  },
  modalSaveText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },

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
    fontSize: 15,
    fontWeight: "600",
  },
  cardPct: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
  cardRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  cardAmount: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
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