import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";

import { ScreenHeader } from "../src/ui/components";
import { colors } from "../src/ui/theme";
import { incomes as incomesApi } from "../src/shared/api/incomes";
import { useAppStore } from "../src/shared/store";
import { formatMoney } from "../src/shared/utils/money";
import { Numpad } from "../src/ui/Numpad";
import { type NumpadKey, parseAmount, updateAmountInput } from "../src/shared/utils/amountInput";
import { formatDisplayDate, parseISODate, toISODate } from "../src/shared/utils/date";

/* ------------------------------------------------------------------ */
/*  Types & constantes                                                 */
/* ------------------------------------------------------------------ */

const MAX_AMOUNT_DIGITS = 9;

type SourceKey = "salary" | "loan" | "dividend" | "other";

const SOURCES: readonly {
  key: SourceKey;
  label: string;
  hint: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}[] = [
  { key: "salary", label: "Salaire", hint: "Base mensuelle", icon: "cash-multiple" },
  { key: "loan", label: "Remboursement de prêt", hint: "Prêt remboursé", icon: "hand-coin-outline" },
  { key: "dividend", label: "Dividende", hint: "Dividende d'action", icon: "trending-up" },
  { key: "other", label: "Autre", hint: "Entrée ponctuelle", icon: "plus-circle-outline" },
];

const IS_RECURRING_DEFAULT: Record<SourceKey, boolean> = {
  salary: true,
  loan: false,
  dividend: false,
  other: false,
};

/* ------------------------------------------------------------------ */
/*  Utilitaires purs                                                   */
/* ------------------------------------------------------------------ */

function sourceToKey(source: string | undefined): SourceKey {
  if (source === "Salaire") return "salary";
  if (source === "Remboursement de prêt") return "loan";
  if (source === "Dividende") return "dividend";
  return "other";
}

/* ------------------------------------------------------------------ */
/*  Sous-composants                                                    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Écran principal                                                    */
/* ------------------------------------------------------------------ */

export default function AddIncome() {
  const userId = useAppStore((s) => s.userId);
  const currency = useAppStore((s) => s.currency);
  const period = useAppStore((s) => s.currentPeriod);

  const params = useLocalSearchParams<{
    incomeId?: string;
    amount?: string;
    source?: string;
    date?: string;
    recurring?: string;
  }>();
  const editingId = params.incomeId ?? null;
  const editSourceKey = sourceToKey(params.source);

  const [amount, setAmount] = useState(params.amount ?? "0");
  const [sourceKey, setSourceKey] = useState<SourceKey>(editSourceKey);
  const [customSource, setCustomSource] = useState(
    editSourceKey === "other" ? params.source ?? "" : ""
  );
  const [recurring, setRecurring] = useState(
    params.recurring !== undefined
      ? params.recurring === "true"
      : IS_RECURRING_DEFAULT[editSourceKey]
  );
  const [date, setDate] = useState(params.date ?? `${period}-01`);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const amountNum = useMemo(() => parseAmount(amount), [amount]);
  const isAmountValid = Number.isFinite(amountNum) && amountNum > 0;

  const sourceLabel =
    SOURCES.find((s) => s.key === sourceKey)?.label ?? "";
  const finalSource =
    sourceKey === "other" ? customSource.trim() || "Autre" : sourceLabel;

  const canSave =
    isAmountValid &&
    finalSource.length > 0 &&
    !saving &&
    !!userId;

  const handleNumpad = useCallback((key: NumpadKey) => {
    setAmount((prev) => updateAmountInput(prev, key, MAX_AMOUNT_DIGITS));
  }, []);

  const selectSource = useCallback((key: SourceKey) => {
    setSourceKey(key);
    setRecurring(IS_RECURRING_DEFAULT[key]);
    if (key === "salary") {
      setDate(`${period}-01`);
    } else {
      setDate(toISODate(new Date()));
    }
  }, [period]);

  const toggleRecurring = useCallback(() => {
    setRecurring((v) => !v);
  }, []);

  const onDateChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS === "android") setShowDatePicker(false);
      if (event.type === "dismissed" || !selected) return;
      setDate(toISODate(selected));
    },
    []
  );

  const save = useCallback(async () => {
    if (!userId) {
      setSaveError("Session non initialisée. Repassez par l'onboarding.");
      return;
    }
    if (!isAmountValid) {
      setSaveError("Saisissez un montant valide.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (editingId) {
        await incomesApi.update(userId, editingId, {
          amount: Math.round(amountNum * 100) / 100,
          income_date: date,
          source: finalSource,
          recurring,
        });
      } else {
        await incomesApi.create(userId, {
          amount: Math.round(amountNum * 100) / 100,
          income_date: date,
          source: finalSource,
          recurring,
        });
      }
      router.back();
    } catch {
      setSaveError(
        "Impossible d'enregistrer le revenu. Vérifiez que le serveur est démarré."
      );
    } finally {
      setSaving(false);
    }
  }, [userId, isAmountValid, amountNum, date, finalSource, recurring, editingId]);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScreenHeader
        title={editingId ? "Modifier un revenu" : "Ajouter un revenu"}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Montant ── */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Montant reçu</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountValue}>{amount}</Text>
            <Text style={styles.amountCurrency}>
              {currency === "XAF" ? "FCFA" : currency}
            </Text>
          </View>
        </View>

        {/* ── Source ── */}
        <Text style={styles.fieldTitle}>Type d'entrée</Text>
        <View style={styles.sourceGrid}>
          {SOURCES.map((s) => {
            const active = sourceKey === s.key;
            return (
              <Pressable
                key={s.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => selectSource(s.key)}
                style={[styles.sourceBtn, active && styles.sourceBtnActive]}
              >
                <View
                  style={[
                    styles.sourceIcon,
                    active && styles.sourceIconActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    color={active ? "#FFFFFF" : colors.primary}
                    name={s.icon}
                    size={20}
                  />
                </View>
                <Text
                  style={[
                    styles.sourceLabel,
                    active && styles.sourceLabelActive,
                  ]}
                >
                  {s.label}
                </Text>
                <Text style={styles.sourceHint}>{s.hint}</Text>
              </Pressable>
            );
          })}
        </View>

        {sourceKey === "other" && (
          <View style={styles.customRow}>
            <MaterialCommunityIcons
              color={colors.textMuted}
              name="pencil-outline"
              size={20}
            />
            <TextInput
              style={styles.customInput}
              placeholder="Intitulé de l'entrée (ex. prime, don…)"
              placeholderTextColor={`${colors.textMuted}80`}
              value={customSource}
              onChangeText={setCustomSource}
              accessibilityLabel="Intitulé de l'entrée"
            />
          </View>
        )}

        {/* ── Récurrent ── */}
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: recurring }}
          accessibilityLabel="Revenu récurrent (mensuel)"
          onPress={toggleRecurring}
          style={styles.recurringRow}
        >
          <View style={styles.recurringCopy}>
            <Text style={styles.recurringTitle}>Revenu récurrent</Text>
            <Text style={styles.recurringSub}>
              {recurring
                ? "Compté comme base mensuelle de vos revenus."
                : "Entrée ponctuelle (prêt, dividende, remise)."}
            </Text>
          </View>
          <View
            style={[
              styles.toggle,
              recurring && styles.toggleOn,
            ]}
          >
            <View
              style={[
                styles.toggleKnob,
                recurring && styles.toggleKnobOn,
              ]}
            />
          </View>
        </Pressable>

        {/* ── Date ── */}
        <View style={styles.dateRow}>
          <MaterialCommunityIcons
            color={colors.primary}
            name="calendar-month-outline"
            size={20}
          />
          <Text style={styles.dateRowLabel}>Date de réception</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Date de réception : ${formatDisplayDate(date)}`}
            onPress={() => setShowDatePicker((v) => !v)}
            style={styles.datePill}
          >
            <Text style={styles.datePillText}>{formatDisplayDate(date)}</Text>
          </Pressable>
        </View>
        {showDatePicker && (
          <>
            <DateTimePicker
              value={parseISODate(date)}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onDateChange}
              maximumDate={new Date()}
              accentColor={colors.primary}
              themeVariant="light"
            />
            {Platform.OS === "ios" && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowDatePicker(false)}
                style={styles.pickerDone}
              >
                <Text style={styles.pickerDoneText}>OK</Text>
              </Pressable>
            )}
          </>
        )}

        {/* ── Numpad ── */}
        <Numpad onPress={handleNumpad} />

        {/* ── Aperçu ── */}
        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>Aperçu</Text>
          <Text style={styles.previewValue}>
            {formatMoney(amountNum, currency)}
          </Text>
          <Text style={styles.previewMeta}>
            {finalSource} · {recurring ? "mensuel" : "ponctuel"} ·{" "}
            {formatDisplayDate(date)}
          </Text>
        </View>

        {/* ── Enregistrer ── */}
        {saveError && (
          <Text style={styles.errorText} accessibilityLiveRegion="polite">
            {saveError}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          accessibilityLabel="Enregistrer le revenu"
          style={[styles.saveBtn, (!canSave || saving) && { opacity: 0.5 }]}
          onPress={save}
          disabled={!canSave}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.saveText}>Enregistrer</Text>
              <MaterialCommunityIcons
                color="#FFFFFF"
                name="check-circle"
                size={22}
              />
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scroll: { gap: 16, padding: 16, paddingBottom: 32 },

  pressed: { opacity: 0.75 },

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

  /* Type d'entrée */
  fieldTitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sourceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  sourceBtn: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    padding: 12,
    width: "48%",
  },
  sourceBtnActive: {
    borderColor: colors.primary,
    borderWidth: 2,
    padding: 11,
  },
  sourceIcon: {
    alignItems: "center",
    backgroundColor: `${colors.primary}1A`,
    borderRadius: 99,
    height: 44,
    justifyContent: "center",
    marginBottom: 2,
    width: 44,
  },
  sourceIconActive: { backgroundColor: colors.primary },
  sourceLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  sourceLabelActive: { color: colors.primary, fontWeight: "800" },
  sourceHint: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: "center",
  },

  /* Source personnalisée */
  customRow: {
    alignItems: "center",
    backgroundColor: "#E5EEFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  customInput: { color: colors.text, flex: 1, fontSize: 16 },

  /* Récurrent */
  recurringRow: {
    alignItems: "center",
    backgroundColor: "#F2F0F7",
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  recurringCopy: { flex: 1, gap: 2 },
  recurringTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  recurringSub: { color: colors.textMuted, fontSize: 12, lineHeight: 16 },
  toggle: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 99,
    height: 30,
    justifyContent: "center",
    padding: 3,
    width: 52,
  },
  toggleOn: { backgroundColor: colors.primary },
  toggleKnob: {
    backgroundColor: "#FFFFFF",
    borderRadius: 99,
    height: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    width: 24,
  },
  toggleKnobOn: { alignSelf: "flex-end" },

  /* Date */
  dateRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  dateRowLabel: { color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 },
  datePill: {
    backgroundColor: `${colors.primary}1A`,
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  datePillText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  pickerDone: { alignSelf: "flex-end", paddingVertical: 4 },
  pickerDoneText: { color: colors.primary, fontSize: 16, fontWeight: "600" },

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
  previewValue: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: "800",
  },
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