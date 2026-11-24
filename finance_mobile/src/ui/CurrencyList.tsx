/** Liste de choix de la devise (inscription, Paramètres) : une ligne par devise, cochée si
 *  sélectionnée. */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { CURRENCIES } from "../shared/config/currencies";
import { colors, interFonts } from "./theme";

export function CurrencyList({
  value,
  onSelect,
  disabled,
}: {
  value: string;
  onSelect: (code: string) => void;
  disabled?: boolean;
}) {
  return (
    <View accessibilityRole="radiogroup">
      {CURRENCIES.map((c, i) => {
        const selected = c.code === value;
        return (
          <Pressable
            accessibilityLabel={`${c.label}, ${c.symbol}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            key={c.code}
            onPress={() => onSelect(c.code)}
            style={({ pressed }) => [
              styles.row,
              i < CURRENCIES.length - 1 && styles.divider,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.label, selected && styles.selected]}>{c.label}</Text>
            <Text style={styles.symbol}>{c.symbol}</Text>
            <MaterialCommunityIcons
              color={selected ? colors.primary : "transparent"}
              name="check"
              size={18}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 46, paddingHorizontal: 14 },
  divider: { borderBottomColor: "#F0F1F6", borderBottomWidth: 1 },
  pressed: { backgroundColor: "#F6F5FF" },
  label: { color: colors.text, flex: 1, fontFamily: interFonts.medium, fontSize: 14 },
  selected: { color: colors.primary, fontFamily: interFonts.semibold },
  symbol: { color: colors.textMuted, fontFamily: interFonts.semibold, fontSize: 13 },
});
