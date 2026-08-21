import { useState, useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { colors } from "../src/ui/theme";

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m] = dateStr.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function computeMonthlyEstimate(amount: string, date: string): number {
  const amountNum = parseFloat(amount.replace(/\s/g, "")) || 0;
  if (amountNum <= 0 || !date) return 0;
  const [y, m] = date.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return 0;
  const target = new Date(y, m - 1);
  const now = new Date();
  let months = (target.getFullYear() - now.getFullYear()) * 12;
  months -= now.getMonth();
  months += target.getMonth();
  months = Math.max(months, 1);
  return Math.round(amountNum / months);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

export default function AddGoal() {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  const monthlyEstimate = useMemo(
    () => computeMonthlyEstimate(amount, date),
    [amount, date],
  );

  const onDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (selectedDate) {
      const y = selectedDate.getFullYear();
      const m = String(selectedDate.getMonth() + 1).padStart(2, "0");
      setDate(`${y}-${m}`);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons color={colors.text} name="arrow-left" size={22} />
          </Pressable>
          <Text style={styles.headerTitle}>Ajouter Un Objectif</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Icon selector ── */}
          <View style={styles.iconSection}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons color={colors.primary} name="ferry" size={40} />
              <View style={styles.iconBadge}>
                <MaterialCommunityIcons color="#FFFFFF" name="pencil" size={16} />
              </View>
            </View>
            <Text style={styles.iconLabel}>Choisir une icône</Text>
          </View>

          {/* ── Inputs ── */}
          <View style={styles.formSection}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Nom de l'objectif</Text>
              <View style={styles.inputRow}>
                <MaterialCommunityIcons color={colors.textMuted} name="flag-outline" size={20} />
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Voyage en Islande"
                  placeholderTextColor={`${colors.textMuted}80`}
                  value={name}
                  onChangeText={setName}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Montant cible</Text>
              <View style={styles.inputRow}>
                <MaterialCommunityIcons color={colors.textMuted} name="cash-multiple" size={20} />
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={`${colors.textMuted}80`}
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                />
                <Text style={styles.inputSuffix}>XAF</Text>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Date cible</Text>
              <Pressable onPress={() => setShowDatePicker(true)} style={styles.inputRow}>
                <MaterialCommunityIcons color={colors.textMuted} name="calendar-month-outline" size={20} />
                <Text style={[styles.input, !date && { color: `${colors.textMuted}80` }]}>
                  {date ? formatDateDisplay(date) : "Mois / Année"}
                </Text>
              </Pressable>
              {showDatePicker && (
                <DateTimePicker
                  value={date ? new Date(parseInt(date.split("-")[0]), parseInt(date.split("-")[1]) - 1) : new Date()}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={onDateChange}
                  minimumDate={new Date()}
                  accentColor={colors.primary}
                  themeVariant="light"
                />
              )}
              {Platform.OS === "ios" && showDatePicker && (
                <Pressable onPress={() => setShowDatePicker(false)} style={styles.pickerDone}>
                  <Text style={styles.pickerDoneText}>OK</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* ── Estimator card ── */}
          <View style={styles.estimatorCard}>
            <View style={styles.estimatorDecor}>
              <MaterialCommunityIcons color="#160066" name="chart-line" size={120} />
            </View>
            <View style={styles.estimatorHeader}>
              <MaterialCommunityIcons color="#160066" name="lightbulb-outline" size={20} />
              <Text style={styles.estimatorTitle}>Estimation de l'effort</Text>
            </View>
            <Text style={styles.estimatorDesc}>
              Pour atteindre cet objectif, vous devrez épargner environ :
            </Text>
            <View style={styles.estimatorRow}>
              <Text style={styles.estimatorAmount}>
                {monthlyEstimate > 0 ? formatNumber(monthlyEstimate) : "0"}
              </Text>
              <Text style={styles.estimatorUnit}>XAF / mois</Text>
            </View>
          </View>
        </ScrollView>

        {/* ── CTA ── */}
        <View style={styles.ctaContainer}>
          <View style={styles.ctaFade} />
          <Pressable style={styles.ctaButton}>
            <MaterialCommunityIcons color="#FFFFFF" name="plus-circle" size={22} />
            <Text style={styles.ctaText}>Créer l'objectif</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 120 },

  /* Header */
  header: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.80)",
    borderBottomColor: "rgba(0,0,0,0.04)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { padding: 6 },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: "600" },

  /* Icon selector */
  iconSection: { alignItems: "center", gap: 8, marginTop: 24 },
  iconCircle: {
    alignItems: "center",
    backgroundColor: "#E5EEFF",
    borderRadius: 999,
    height: 96,
    justifyContent: "center",
    position: "relative",
    width: 96,
  },
  iconBadge: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 99,
    bottom: 0,
    elevation: 4,
    height: 32,
    justifyContent: "center",
    position: "absolute",
    right: 0,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    width: 32,
  },
  iconLabel: { color: colors.textMuted, fontSize: 14, fontWeight: "500" },

  /* Form */
  formSection: { gap: 16, marginTop: 32, paddingHorizontal: 16 },
  field: { gap: 6 },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: "500" },
  inputRow: {
    alignItems: "center",
    backgroundColor: "#E5EEFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    paddingLeft: 14,
    paddingRight: 16,
    paddingVertical: 14,
  },
  input: { color: colors.text, flex: 1, fontSize: 16 },
  inputSuffix: { color: colors.textMuted, fontSize: 16 },
  pickerDone: { alignSelf: "flex-end", paddingVertical: 4 },
  pickerDoneText: { color: colors.primary, fontSize: 16, fontWeight: "600" },

  /* Estimator */
  estimatorCard: {
    backgroundColor: "#E4DFFF",
    borderRadius: 16,
    gap: 8,
    marginHorizontal: 16,
    marginTop: 32,
    overflow: "hidden",
    padding: 16,
  },
  estimatorDecor: {
    alignItems: "flex-end",
    opacity: 0.20,
    position: "absolute",
    right: -32,
    top: -32,
  },
  estimatorHeader: { alignItems: "center", flexDirection: "row", gap: 8 },
  estimatorTitle: {
    color: "#160066",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  estimatorDesc: { color: "#4234A2", fontSize: 16, lineHeight: 24 },
  estimatorRow: { alignItems: "flex-end", flexDirection: "row", gap: 8, marginTop: 4 },
  estimatorAmount: {
    color: "#160066",
    fontSize: 48,
    fontWeight: "700",
    letterSpacing: -2,
    lineHeight: 56,
  },
  estimatorUnit: { color: "#4234A2", fontSize: 20, fontWeight: "600", marginBottom: 4 },

  /* CTA */
  ctaContainer: {
    bottom: 0,
    left: 0,
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 40,
    position: "absolute",
    right: 0,
  },
  ctaFade: {
    backgroundColor: "rgba(248,249,255,0.90)",
    bottom: 60,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  ctaButton: {
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
  ctaText: { color: "#FFFFFF", fontSize: 20, fontWeight: "600" },
});
