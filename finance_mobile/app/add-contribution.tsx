import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { ScreenHeader } from "../src/ui/components";
import { colors } from "../src/ui/theme";
import { savings as savingsApi } from "../src/shared/api/savings";
import { useAppStore } from "../src/shared/store";
import { formatMoney } from "../src/shared/utils/money";
import { Numpad } from "../src/ui/Numpad";
import { type NumpadKey, parseAmount, updateAmountInput } from "../src/shared/utils/amountInput";

const MAX_AMOUNT_DIGITS = 9;
const NUMPAD_STYLE = { marginTop: 4 } as const;

function apiErrorDetail(err: unknown): string | null {
  const detail =
    (err as { response?: { data?: { detail?: unknown } } })?.response?.data
      ?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string };
    if (first && typeof first.msg === "string") return first.msg;
  }
  return null;
}

export default function AddContribution() {
  const userId = useAppStore((s) => s.userId);
  const currency = useAppStore((s) => s.currency);

  const params = useLocalSearchParams<{
    goalId?: string;
    goal?: string;
    current?: string;
    target?: string;
  }>();

  const goalId = params.goalId ?? null;
  const goalName = params.goal ?? "Objectif";
  const current = Number(params.current ?? 0) || 0;
  const target = Number(params.target ?? 0) || 0;

  const [amount, setAmount] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNum = useMemo(() => parseAmount(amount), [amount]);
  const isAmountValid = Number.isFinite(amountNum) && amountNum > 0;
  const afterContribution = current + (isAmountValid ? amountNum : 0);
  const canSave = isAmountValid && !saving && !!userId && !!goalId;

  const handleNumpad = useCallback((key: NumpadKey) => {
    setAmount((prev) => updateAmountInput(prev, key, MAX_AMOUNT_DIGITS));
  }, []);

  const save = useCallback(async () => {
    if (!userId) {
      setError("Session non initialisée. Repassez par l'onboarding.");
      return;
    }
    if (!goalId) {
      setError("Objectif introuvable. Revenez à l'épargne.");
      return;
    }
    if (!isAmountValid) {
      setError("Saisissez un montant valide.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await savingsApi.contribute(
        userId,
        goalId,
        Math.round(amountNum * 100) / 100,
      );
      router.back();
    } catch (err) {
      setError(
        apiErrorDetail(err) ??
          "Impossible d'enregistrer le versement. Vérifiez que le serveur est démarré.",
      );
      setSaving(false);
    }
  }, [userId, goalId, isAmountValid, amountNum]);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScreenHeader title="Verser de l'argent" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Objectif ── */}
        <View style={styles.goalCard}>
          <View style={styles.goalIcon}>
            <MaterialCommunityIcons
              color={colors.primary}
              name="piggy-bank"
              size={22}
            />
          </View>
          <View style={styles.goalCopy}>
            <Text style={styles.goalName} numberOfLines={1}>
              {goalName}
            </Text>
            <Text style={styles.goalProgress}>
              {formatMoney(current, currency)}
              {target > 0 ? ` sur ${formatMoney(target, currency)}` : ""}
            </Text>
          </View>
        </View>

        {/* ── Montant ── */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Montant à verser</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountValue}>{amount}</Text>
            <Text style={styles.amountCurrency}>
              {currency === "XAF" ? "FCFA" : currency}
            </Text>
          </View>
        </View>

        <Numpad onPress={handleNumpad} style={NUMPAD_STYLE} />

        {/* ── Aperçu ── */}
        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>Aperçu</Text>
          <Text style={styles.previewValue}>
            {formatMoney(afterContribution, currency)}
          </Text>
          <Text style={styles.previewMeta}>
            après versement
            {target > 0
              ? ` · ${Math.min(
                  100,
                  Math.round((afterContribution / target) * 100),
                )}% atteint`
              : ""}
          </Text>
        </View>

        {/* ── Erreur ── */}
        {error && (
          <Text style={styles.errorText} accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}

        {/* ── Enregistrer ── */}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          accessibilityLabel="Enregistrer le versement"
          style={[styles.saveBtn, (!canSave || saving) && { opacity: 0.5 }]}
          onPress={save}
          disabled={!canSave}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.saveText}>Verser</Text>
              <MaterialCommunityIcons
                color="#FFFFFF"
                name="bank-transfer-in"
                size={22}
              />
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scroll: { gap: 16, padding: 16, paddingBottom: 32 },

  pressed: { opacity: 0.75 },

  /* Objectif */
  goalCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  goalIcon: {
    alignItems: "center",
    backgroundColor: `${colors.primary}1A`,
    borderRadius: 12,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  goalCopy: { flex: 1, gap: 2 },
  goalName: { color: colors.text, fontSize: 15, fontWeight: "700" },
  goalProgress: { color: colors.textMuted, fontSize: 13 },

  /* Montant */
  amountCard: {
    alignItems: "center",
    backgroundColor: "#EFF4FF",
    borderRadius: 16,
    elevation: 2,
    justifyContent: "center",
    paddingVertical: 36,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  amountLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4,
  },
  amountRow: { alignItems: "flex-end", flexDirection: "row" },
  amountValue: {
    color: colors.text,
    fontSize: 48,
    fontWeight: "700",
    letterSpacing: -2,
  },
  amountCurrency: {
    color: colors.textMuted,
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 2,
    marginLeft: 8,
  },

  /* Aperçu */
  previewCard: {
    alignItems: "center",
    backgroundColor: "#EFF4FF",
    borderRadius: 14,
    gap: 2,
    padding: 14,
  },
  previewLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  previewValue: { color: colors.primary, fontSize: 22, fontWeight: "800" },
  previewMeta: { color: colors.textMuted, fontSize: 12 },

  /* Erreur */
  errorText: { color: colors.danger, fontSize: 13, fontWeight: "600" },

  /* Sauvegarder */
  saveBtn: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 12,
    elevation: 4,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  saveText: { color: "#FFFFFF", fontSize: 20, fontWeight: "600" },
});
