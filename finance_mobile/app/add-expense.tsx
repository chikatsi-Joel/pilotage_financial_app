import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "../src/ui/components";
import { colors } from "../src/ui/theme";

interface Category {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}

const CATEGORIES: Category[] = [
  { key: "alimentation", label: "Alimentation", icon: "silverware-fork-knife" },
  { key: "transport", label: "Transport", icon: "car" },
  { key: "loisirs", label: "Loisirs", icon: "controller" },
  { key: "sante", label: "Santé", icon: "medical-bag" },
  { key: "maison", label: "Maison", icon: "home" },
  { key: "shopping", label: "Shopping", icon: "shopping" },
  { key: "factures", label: "Factures", icon: "receipt" },
];

const NUMPAD = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [",", "0", "del"],
];

export default function AddExpense() {
  const [amount, setAmount] = useState("0");
  const [selectedCategory, setSelectedCategory] = useState("alimentation");
  const [note, setNote] = useState("");
  const [showMore, setShowMore] = useState(false);

  const visibleCategories = showMore ? CATEGORIES : CATEGORIES.slice(0, 4);

  function handleNumpad(val: string) {
    if (val === "del") {
      setAmount((a) => (a.length > 1 ? a.slice(0, -1) : "0"));
    } else if (val === ",") {
      if (!amount.includes(",")) setAmount((a) => a + ",");
    } else {
      setAmount((a) => (a === "0" ? val : a.length < 7 ? a + val : a));
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScreenHeader
        title="Tableau De Bord"
        right={
          <View style={styles.headerAvatar}>
            <MaterialCommunityIcons color="#FFFFFF" name="account" size={18} />
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Amount display card */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Montant de la dépense</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountValue}>{amount}</Text>
            <Text style={styles.amountCurrency}>€</Text>
          </View>
          <View style={styles.dateBadge}>
            <MaterialCommunityIcons color={colors.primary} name="calendar-edit" size={14} />
            <Text style={styles.dateBadgeText}>Aujourd'hui</Text>
          </View>
        </View>

        {/* Note */}
        <View style={styles.noteRow}>
          <MaterialCommunityIcons color={colors.textMuted} name="note-text" size={20} />
          <TextInput
            style={styles.noteInput}
            placeholder="Ajouter une note (optionnel)"
            placeholderTextColor={`${colors.textMuted}80`}
            value={note}
            onChangeText={setNote}
          />
        </View>

        {/* Categories */}
        <Text style={styles.catTitle}>Catégorie</Text>
        <View style={styles.catGrid}>
          {visibleCategories.map((cat) => {
            const active = selectedCategory === cat.key;
            return (
              <Pressable
                key={cat.key}
                style={[styles.catBtn, active && styles.catBtnActive]}
                onPress={() => setSelectedCategory(cat.key)}
              >
                <View style={[styles.catIcon, active && styles.catIconActive]}>
                  <MaterialCommunityIcons
                    color={active ? "#FFFFFF" : colors.primary}
                    name={cat.icon}
                    size={22}
                  />
                </View>
                <Text style={[styles.catLabel, active && styles.catLabelActive]}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
          <Pressable style={styles.catBtn} onPress={() => setShowMore((v) => !v)}>
            <View style={styles.catIconMore}>
              <MaterialCommunityIcons
                color={colors.textMuted}
                name={showMore ? "chevron-up" : "dots-horizontal"}
                size={22}
              />
            </View>
            <Text style={styles.catLabelMore}>{showMore ? "Moins" : "Plus"}</Text>
          </Pressable>
        </View>

        {/* Numpad */}
        <View style={styles.numpad}>
          {NUMPAD.map((row, ri) =>
            row.map((val) => (
              <Pressable
                key={`${ri}-${val}`}
                style={[
                  styles.numpadBtn,
                  val === "del" && styles.numpadBtnDel,
                ]}
                onPress={() => handleNumpad(val)}
              >
                {val === "del" ? (
                  <MaterialCommunityIcons color={colors.textMuted} name="backspace" size={22} />
                ) : (
                  <Text style={styles.numpadText}>{val}</Text>
                )}
              </Pressable>
            )),
          )}
        </View>

        {/* Save */}
        <Pressable style={styles.saveBtn}>
          <Text style={styles.saveText}>Enregistrer</Text>
          <MaterialCommunityIcons color="#FFFFFF" name="check-circle" size={22} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scroll: { gap: 16, padding: 16, paddingBottom: 32 },

  headerAvatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },

  /* Amount card */
  amountCard: {
    alignItems: "center",
    backgroundColor: "#EFF4FF",
    borderRadius: 16,
    elevation: 2,
    justifyContent: "center",
    paddingVertical: 40,
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  amountLabel: { color: colors.textMuted, fontSize: 14, fontWeight: "500", marginBottom: 4 },
  amountRow: { alignItems: "flex-end", flexDirection: "row" },
  amountValue: { color: colors.text, fontSize: 48, fontWeight: "700", letterSpacing: -2 },
  amountCurrency: { color: colors.textMuted, fontSize: 24, fontWeight: "600", marginBottom: 2, marginLeft: 4 },
  dateBadge: {
    alignItems: "center",
    backgroundColor: `${colors.primary}1A`,
    borderRadius: 99,
    bottom: 12,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    position: "absolute",
    right: 12,
  },
  dateBadgeText: { color: colors.primary, fontSize: 12, fontWeight: "700" },

  /* Note */
  noteRow: {
    alignItems: "center",
    backgroundColor: "#E5EEFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  noteInput: { color: colors.text, flex: 1, fontSize: 16 },

  /* Categories */
  catTitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  catBtn: {
    alignItems: "center",
    backgroundColor: "#E5EEFF",
    borderRadius: 12,
    gap: 6,
    padding: 12,
    width: "22%",
  },
  catBtnActive: {
    backgroundColor: "#E5EEFF",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  catIcon: {
    alignItems: "center",
    backgroundColor: `${colors.primary}1A`,
    borderRadius: 99,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  catIconActive: {
    backgroundColor: colors.primary,
  },
  catLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  catLabelActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  catIconMore: {
    alignItems: "center",
    backgroundColor: "#D3E4FE",
    borderRadius: 99,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  catLabelMore: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },

  /* Numpad */
  numpad: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  numpadBtn: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    elevation: 1,
    height: 56,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    width: "30.33%",
  },
  numpadBtnDel: {
    backgroundColor: "#E5EEFF",
    elevation: 0,
    shadowOpacity: 0,
  },
  numpadText: { color: colors.text, fontSize: 24, fontWeight: "600" },

  /* Save */
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
