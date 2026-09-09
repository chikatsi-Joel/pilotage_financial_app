import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router } from "expo-router";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { colors } from "../../src/ui/theme";
import { savings as savingsApi } from "../../src/shared/api/savings";
import { useAppStore } from "../../src/shared/store";

type Goal = {
  name: string;
  sub: string;
  icon: string;
  current: number;
  target: number;
  deadline: string;
};

const dateInMonths = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const GOALS: Goal[] = [
  {
    name: "Achat Appartement",
    sub: "Apport personnel",
    icon: "home",
    current: 18500,
    target: 40000,
    deadline: dateInMonths(18),
  },
  {
    name: "Vacances Japon",
    sub: "Prévu en Octobre",
    icon: "flight-takeoff",
    current: 2250,
    target: 3000,
    deadline: dateInMonths(6),
  },
  {
    name: "Fonds d'urgence",
    sub: "Sécurité",
    icon: "health-and-safety",
    current: 1700,
    target: 5000,
    deadline: dateInMonths(12),
  },
];

const GOAL_ICONS = [
  "home",
  "flight-takeoff",
  "health-and-safety",
  "savings",
  "beach-access",
  "card-giftcard",
  "school",
  "directions-car",
] as const;

const formatEur = (n: number) =>
  new Intl.NumberFormat("fr-FR").format(n) + " €";

const goalPct = (g: { current: number; target: number }) => {
  if (g.target <= 0) return 0;
  return Math.round((g.current / g.target) * 100);
};

const goalPctNum = (g: { current: number; target: number }) => {
  if (g.target <= 0) return 0;
  return Math.min(g.current / g.target, 1);
};

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

/**
 * Indicateur de progression "wavy" — Material 3 Expressive.
 * La portion active ondule (sinusoïde), la portion restante
 * est une ligne plate fine. Terminaison par un point discret.
 */
function WaveProgressBar({
  pct,
  gradId,
  height = 18,
}: {
  pct: number;
  gradId: string;
  height?: number;
}) {
  const width = 300; // unités du viewBox, s'étire à 100% de la largeur réelle
  const amplitude = 4;
  const wavelength = 16;
  const midY = height / 2;
  const clamped = Math.min(Math.max(pct, 0), 1);
  const splitX = clamped * width;

  const step = 2;
  const activePoints: string[] = [];
  for (let x = 0; x <= splitX; x += step) {
    const y = midY + amplitude * Math.sin((x / wavelength) * Math.PI * 2);
    activePoints.push(`${x.toFixed(1)},${y.toFixed(2)}`);
  }
  if (splitX > 0) {
    const y = midY + amplitude * Math.sin((splitX / wavelength) * Math.PI * 2);
    activePoints.push(`${splitX.toFixed(1)},${y.toFixed(2)}`);
  }
  const activePath = activePoints.length
    ? `M ${activePoints.join(" L ")}`
    : "";

  const restStartX = Math.min(splitX + 8, width - 4);
  const restPath =
    clamped < 1 ? `M ${restStartX},${midY} L ${width - 4},${midY}` : "";

  return (
    <View style={{ width: "100%", height }}>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={`${colors.primary}99`} />
            <Stop offset="1" stopColor={colors.primary} />
          </LinearGradient>
        </Defs>

        {restPath !== "" && (
          <Path
            d={restPath}
            stroke={`${colors.primary}26`}
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

        {clamped < 1 && (
          <Circle cx={width - 3} cy={midY} r={2.5} fill={`${colors.primary}40`} />
        )}
      </Svg>
    </View>
  );
}

export default function Savings() {
  const [goals, setGoals] = useState<Goal[]>(GOALS);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState("");
  const [createVisible, setCreateVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSub, setNewSub] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newIcon, setNewIcon] = useState<string>(GOAL_ICONS[0]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const userId = useAppStore((s) => s.userId);

  const editing = editIndex !== null ? goals[editIndex] : null;
  const editAmount = parseFloat(editTarget.replace(",", "."));
  const canSaveEdit =
    Number.isFinite(editAmount) && editAmount > 0;

  const createAmount = parseFloat(newTarget.replace(",", "."));
  const canSaveCreate =
    newName.trim().length > 0 &&
    Number.isFinite(createAmount) &&
    createAmount > 0;

  function openEdit(index: number) {
    setEditIndex(index);
    setEditTarget(goals[index].target.toString());
  }

  function saveEdit() {
    if (editIndex === null || !canSaveEdit) return;
    setGoals((prev) =>
      prev.map((g, i) =>
        i === editIndex
          ? { ...g, target: Math.round(editAmount * 100) / 100 }
          : g
      )
    );
    setEditIndex(null);
  }

  async function createGoal() {
    if (!canSaveCreate || creating) return;
    if (!userId) {
      setCreateError("Session non initialisée. Repassez par l'onboarding.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await savingsApi.create(userId, {
        name: newName.trim(),
        description: newSub.trim() || undefined,
        target_amount: Math.round(createAmount * 100) / 100,
        deadline: dateInMonths(12),
      });
      setGoals((prev) => [
        {
          name: created.name,
          sub: created.description || "Nouvel objectif",
          icon: newIcon,
          current: Number(created.current_amount) || 0,
          target: Number(created.target_amount),
          deadline: created.deadline,
        },
        ...prev,
      ]);
      setCreateVisible(false);
    } catch {
      setCreateError(
        "Impossible de créer l'objectif. Vérifiez que le serveur est démarré."
      );
    } finally {
      setCreating(false);
    }
  }

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
        <View style={styles.sectionHeader}>
          <Text style={styles.goalsTitle}>Vos objectifs</Text>
          <Pressable
            onPress={() => setCreateVisible(true)}
            hitSlop={6}
            style={styles.addGoalBtn}
            accessibilityLabel="Créer un nouvel objectif"
            accessibilityRole="button"
          >
            <MaterialCommunityIcons
              name="plus"
              size={16}
              color={colors.primary}
            />
            <Text style={styles.addGoalText}>Ajouter</Text>
          </Pressable>
        </View>
        <View style={styles.goalsList}>
          {goals.map((g, i) => (
            <Link
              key={g.name}
              asChild
              href={{
                pathname: "/savings-detail",
                params: {
                  goal: g.name,
                  current: g.current.toString(),
                  target: g.target.toString(),
                  deadline: g.deadline,
                },
              }}
            >
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
                    <View style={styles.goalTopActions}>
                      <View style={styles.goalPctBadge}>
                        <Text style={styles.goalPctText}>{goalPct(g)}%</Text>
                      </View>
                      <Pressable
                        onPress={() => openEdit(i)}
                        hitSlop={8}
                        accessibilityLabel={`Augmenter l'objectif ${g.name}`}
                        accessibilityRole="button"
                      >
                        <MaterialCommunityIcons
                          name="pencil-outline"
                          size={18}
                          color={colors.textMuted}
                        />
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.goalBottom}>
                    <WaveProgressBar
                      pct={goalPctNum(g)}
                      gradId={`wave-grad-${i}`}
                    />
                    <View style={styles.goalAmounts}>
                      <Text style={styles.goalCurrent}>{formatEur(g.current)}</Text>
                      <Text style={styles.goalTarget}>{formatEur(g.target)}</Text>
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
              Astuce IA <Text style={styles.insightDot}>●</Text>
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

      {/* ── Modal: augmenter l'objectif ── */}
      <Modal
        visible={editIndex !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditIndex(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismiss} onPress={() => setEditIndex(null)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalKeyboard}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Augmenter l'objectif</Text>
              {editing && <Text style={styles.modalGoal}>{editing.name}</Text>}
              <Text style={styles.modalCurrent}>
                Objectif actuel : {formatEur(editing ? editing.target : 0)} ·{" "}
                {formatEur(editing ? editing.current : 0)} épargnés
              </Text>

              <Text style={styles.fieldLabel}>Nouvel objectif (€)</Text>
              <TextInput
                style={styles.fieldInput}
                value={editTarget}
                onChangeText={(t) => setEditTarget(t.replace(/[^0-9,]/g, ""))}
                placeholder="Ex : 50 000"
                placeholderTextColor={`${colors.textMuted}80`}
                keyboardType="numeric"
              />

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalCancel}
                  onPress={() => setEditIndex(null)}
                >
                  <Text style={styles.modalCancelText}>Annuler</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalSave, { opacity: canSaveEdit ? 1 : 0.5 }]}
                  onPress={saveEdit}
                  disabled={!canSaveEdit}
                >
                  <Text style={styles.modalSaveText}>Enregistrer</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Modal: créer un objectif ── */}
      <Modal
        visible={createVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalDismiss}
            onPress={() => setCreateVisible(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalKeyboard}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Nouvel objectif</Text>
              <Text style={styles.modalGoal}>Créez votre objectif d'épargne</Text>

              <Text style={styles.fieldLabel}>Nom</Text>
              <TextInput
                style={styles.fieldInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="Ex : Nouvelle voiture"
                placeholderTextColor={`${colors.textMuted}80`}
              />

              <Text style={styles.fieldLabel}>Libellé (optionnel)</Text>
              <TextInput
                style={styles.fieldInput}
                value={newSub}
                onChangeText={setNewSub}
                placeholder="Ex : Apport personnel"
                placeholderTextColor={`${colors.textMuted}80`}
              />

              <Text style={styles.fieldLabel}>Objectif (€)</Text>
              <TextInput
                style={styles.fieldInput}
                value={newTarget}
                onChangeText={(t) =>
                  setNewTarget(t.replace(/[^0-9,]/g, ""))
                }
                placeholder="Ex : 12 000"
                placeholderTextColor={`${colors.textMuted}80`}
                keyboardType="numeric"
              />

              <Text style={styles.fieldLabel}>Icône</Text>
              <View style={styles.iconChoiceRow}>
                {GOAL_ICONS.map((icon) => (
                  <Pressable
                    key={icon}
                    onPress={() => setNewIcon(icon)}
                    style={[
                      styles.iconChoice,
                      newIcon === icon && styles.iconChoiceActive,
                    ]}
                  >
                    <MaterialIcons
                      color={
                        newIcon === icon ? colors.primary : colors.textMuted
                      }
                      name={icon as any}
                      size={20}
                    />
                  </Pressable>
                ))}
              </View>

              {createError && (
                <Text style={styles.createErrorText}>{createError}</Text>
              )}

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalCancel}
                  onPress={() => setCreateVisible(false)}
                  disabled={creating}
                >
                  <Text style={styles.modalCancelText}>Annuler</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalSave,
                    { opacity: canSaveCreate && !creating ? 1 : 0.5 },
                  ]}
                  onPress={createGoal}
                  disabled={!canSaveCreate || creating}
                >
                  {creating ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalSaveText}>Créer</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── FAB ── */}
      {/* <Pressable style={styles.fab}
            onPress={() => router.push("/add-goal")}>
        <MaterialCommunityIcons color="#FFFFFF" name="plus" size={22} />
        <Text style={styles.fabText}>Nouveau</Text>
      </Pressable>*/}
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
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  addGoalBtn: {
    alignItems: "center",
    backgroundColor: `${colors.primary}1A`,
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addGoalText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700",
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
  goalTopActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  goalPctText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "500",
  },
  goalBottom: { gap: 8 },
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
  },
  modalGoal: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  modalCurrent: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 18,
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
  iconChoiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  iconChoice: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 99,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  iconChoiceActive: {
    backgroundColor: `${colors.primary}1A`,
    borderColor: colors.primary,
  },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 24 },
  createErrorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 14,
  },
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