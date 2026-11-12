import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { colors, interFonts } from "./theme";
import { formatDisplayDate, parseISODate, toISODate } from "../shared/utils/date";
import {
  DEADLINE_PRESETS,
  addMonthsISO,
  durationLabel,
  matchingPreset,
  monthlyNeeded,
} from "../shared/utils/goalDeadline";

const PRESET_LABEL: Record<number, string> = { 6: "6 mois", 12: "1 an", 24: "2 ans", 36: "3 ans" };

type Props = {
  /** Échéance "YYYY-MM-DD". */
  value: string;
  onChange: (iso: string) => void;
  /** Pour afficher l'effort mensuel ; omis tant que le montant n'est pas saisi. */
  target?: number;
  current?: number;
  format: (amount: number) => string;
};

/** Échéance d'un objectif : durées rapides + date libre, avec l'effort mensuel qui en découle. */
export function DeadlinePicker({ value, onChange, target, current = 0, format }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const today = new Date();
  const preset = matchingPreset(value, today);
  const needed =
    target !== undefined && Number.isFinite(target) && target > 0
      ? monthlyNeeded(target, current, value, today)
      : undefined;

  const onPick = (_e: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === "android") setShowPicker(false);
    if (picked) onChange(toISODate(picked));
  };

  return (
    <View>
      <View style={styles.chips}>
        {DEADLINE_PRESETS.map((months) => {
          const active = preset === months;
          return (
            <Pressable
              key={months}
              onPress={() => onChange(addMonthsISO(today, months))}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{PRESET_LABEL[months]}</Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setShowPicker(true)}
          style={[styles.chip, preset === null && styles.chipActive]}
          accessibilityRole="button"
          accessibilityLabel="Choisir une date précise"
        >
          <MaterialCommunityIcons
            name="calendar-month-outline"
            size={15}
            color={preset === null ? colors.primary : colors.textMuted}
          />
        </Pressable>
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryDate}>{formatDisplayDate(value)}</Text>
        <Text style={styles.summaryWhen}>{durationLabel(value, today)}</Text>
      </View>
      {needed !== undefined && (
        <Text style={styles.effort}>
          {needed === null
            ? "Choisissez une date à venir"
            : needed === 0
              ? "Objectif déjà atteint"
              : <>≈ <Text style={styles.effortAmount}>{format(Math.ceil(needed))}</Text> à mettre de côté par mois</>}
        </Text>
      )}

      {showPicker && (
        <DateTimePicker
          value={parseISODate(value)}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onPick}
          minimumDate={new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)}
          accentColor={colors.primary}
          themeVariant="light"
        />
      )}
      {Platform.OS === "ios" && showPicker && (
        <Pressable onPress={() => setShowPicker(false)} style={styles.done}>
          <Text style={styles.doneText}>OK</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 99,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    minWidth: 44,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipActive: { backgroundColor: `${colors.primary}1A`, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontFamily: interFonts.semibold, fontSize: 13 },
  chipTextActive: { color: colors.primary },
  summary: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  summaryDate: { color: colors.text, fontFamily: interFonts.semibold, fontSize: 14 },
  summaryWhen: { color: colors.textMuted, fontFamily: interFonts.medium, fontSize: 12 },
  effort: { color: colors.textMuted, fontFamily: interFonts.medium, fontSize: 13, marginTop: 6 },
  effortAmount: { color: colors.primary, fontFamily: interFonts.bold },
  done: { alignSelf: "flex-end", paddingHorizontal: 12, paddingVertical: 6 },
  doneText: { color: colors.primary, fontFamily: interFonts.bold, fontSize: 15 },
});
