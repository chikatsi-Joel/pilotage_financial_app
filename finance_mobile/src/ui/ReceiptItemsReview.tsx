import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import {
  type CategoryOption,
  type DraftLine,
  isLineValid,
  linesTotal,
  totalGap,
  validLines,
} from "../shared/utils/receiptItems";
import { formatMoney } from "../shared/utils/money";
import { colors } from "./theme";
import { interFonts } from "./theme";

interface Props {
  lines: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  categories: CategoryOption[];
  defaultCategoryKey: string;
  currency: string;
  scanTotal: number | null;
  merchant?: string | null;
  saving: boolean;
  error: string | null;
  onConfirm: () => void;
  onUseTotal: () => void;
}

/** Validation d'un ticket multi-produits : lignes éditables, une dépense par ligne. */
export function ReceiptItemsReview({
  lines,
  onChange,
  categories,
  defaultCategoryKey,
  currency,
  scanTotal,
  merchant,
  saving,
  error,
  onConfirm,
  onUseTotal,
}: Props) {
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const patch = (id: string, change: Partial<DraftLine>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...change } : l)));
  const remove = (id: string) => onChange(lines.filter((l) => l.id !== id));
  const add = () =>
    onChange([
      ...lines,
      { id: `line-${Date.now()}`, label: "", amount: "", categoryKey: defaultCategoryKey },
    ]);

  const count = validLines(lines).length;
  const total = linesTotal(lines);
  const gap = totalGap(total, scanTotal);
  const labelOf = (key: string) => categories.find((c) => c.key === key)?.label ?? "Catégorie";

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>Achats détectés</Text>
        <Text style={styles.sub}>
          {merchant ? `${merchant} · ` : ""}
          Vérifiez chaque ligne avant d'enregistrer.
        </Text>
      </View>

      {lines.map((line) => {
        const valid = isLineValid(line);
        return (
          <View key={line.id} style={[styles.row, !valid && styles.rowInvalid]}>
            <View style={styles.rowTop}>
              <TextInput
                accessibilityLabel="Libellé de l'achat"
                value={line.label}
                onChangeText={(label) => patch(line.id, { label })}
                placeholder="Produit"
                placeholderTextColor="#9AA0B4"
                style={styles.labelInput}
              />
              <TextInput
                accessibilityLabel="Montant de l'achat"
                value={line.amount}
                onChangeText={(amount) => patch(line.id, { amount })}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor="#9AA0B4"
                style={styles.amountInput}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Supprimer la ligne"
                hitSlop={8}
                onPress={() => remove(line.id)}
              >
                <MaterialCommunityIcons color={colors.textMuted} name="close" size={20} />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Catégorie : ${labelOf(line.categoryKey)}`}
              onPress={() => setPickerFor(line.id)}
              style={styles.catChip}
            >
              <MaterialCommunityIcons color={colors.primary} name="tag-outline" size={14} />
              <Text style={styles.catChipText}>{labelOf(line.categoryKey)}</Text>
              <MaterialCommunityIcons color={colors.primary} name="chevron-down" size={14} />
            </Pressable>
          </View>
        );
      })}

      <Pressable accessibilityRole="button" onPress={add} style={styles.addBtn}>
        <MaterialCommunityIcons color={colors.primary} name="plus" size={18} />
        <Text style={styles.addText}>Ajouter une ligne</Text>
      </Pressable>

      <View style={styles.totalCard}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total des lignes</Text>
          <Text style={styles.totalValue}>{formatMoney(total, currency)}</Text>
        </View>
        {gap != null && scanTotal != null && (
          <Text style={styles.warn}>
            Le ticket indique {formatMoney(scanTotal, currency)} : {formatMoney(gap, currency)} d'écart.
            Vérifiez les montants.
          </Text>
        )}
      </View>

      {error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: count === 0 || saving }}
        disabled={count === 0 || saving}
        onPress={onConfirm}
        style={[styles.confirm, (count === 0 || saving) && { opacity: 0.5 }]}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.confirmText}>
            Valider {count} dépense{count > 1 ? "s" : ""}
          </Text>
        )}
      </Pressable>

      <Pressable accessibilityRole="button" onPress={onUseTotal} style={styles.ghost}>
        <Text style={styles.ghostText}>Enregistrer en une seule dépense</Text>
      </Pressable>

      <Modal visible={pickerFor !== null} transparent animationType="fade" onRequestClose={() => setPickerFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerFor(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Choisir une catégorie</Text>
            <ScrollView>
              {categories.map((c) => (
                <Pressable
                  key={c.key}
                  accessibilityRole="button"
                  onPress={() => {
                    if (pickerFor) patch(pickerFor, { categoryKey: c.key });
                    setPickerFor(null);
                  }}
                  style={styles.sheetItem}
                >
                  <Text style={styles.sheetItemText}>{c.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  head: { gap: 2 },
  title: { color: colors.text, fontSize: 17, fontFamily: interFonts.bold },
  sub: { color: colors.textMuted, fontSize: 12, fontFamily: interFonts.regular },
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  rowInvalid: { borderColor: colors.danger },
  rowTop: { alignItems: "center", flexDirection: "row", gap: 10 },
  labelInput: { color: colors.text, flex: 1, fontSize: 14, fontFamily: interFonts.semibold, padding: 0 },
  amountInput: {
    color: colors.text,
    fontSize: 14,
    fontFamily: interFonts.bold,
    minWidth: 70,
    padding: 0,
    textAlign: "right",
  },
  catChip: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primarySoft,
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  catChipText: { color: colors.primary, fontSize: 11, fontFamily: interFonts.bold },
  addBtn: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    paddingVertical: 4,
  },
  addText: { color: colors.primary, fontSize: 13, fontFamily: interFonts.bold },
  totalCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    gap: 6,
    padding: 14,
  },
  totalRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { color: colors.textMuted, fontSize: 12, fontFamily: interFonts.bold },
  totalValue: { color: colors.primary, fontSize: 18, fontFamily: interFonts.bold },
  warn: { color: colors.warning, fontSize: 11, fontFamily: interFonts.semibold },
  error: { color: colors.danger, fontSize: 12, fontFamily: interFonts.semibold },
  confirm: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 99,
    paddingVertical: 14,
  },
  confirmText: { color: "#FFFFFF", fontSize: 14, fontFamily: interFonts.bold },
  ghost: { alignItems: "center", paddingVertical: 8 },
  ghostText: { color: colors.primary, fontSize: 13, fontFamily: interFonts.bold },
  backdrop: {
    backgroundColor: "rgba(11,28,48,0.55)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "60%",
    padding: 20,
  },
  sheetTitle: { color: colors.text, fontSize: 15, fontFamily: interFonts.bold, marginBottom: 8 },
  sheetItem: { paddingVertical: 12 },
  sheetItemText: { color: colors.text, fontSize: 14, fontFamily: interFonts.semibold },
});
