import { memo } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { NUMPAD_KEYS, type NumpadKey } from "../shared/utils/amountInput";
import { colors } from "./theme";
import { interFonts } from "./theme";

interface NumpadProps {
  onPress: (key: NumpadKey) => void;
  style?: StyleProp<ViewStyle>;
}

/** Pavé numérique partagé par les écrans de saisie de montant. */
export const Numpad = memo(function Numpad({ onPress, style }: NumpadProps) {
  return (
    <View style={[styles.numpad, style]}>
      {NUMPAD_KEYS.map((key) => (
        <Pressable
          key={key}
          accessibilityLabel={key === "del" ? "Effacer" : key === "," ? "Virgule" : key}
          accessibilityRole="button"
          onPress={() => onPress(key)}
          style={({ pressed }) => [
            styles.numpadBtn,
            key === "del" && styles.numpadBtnDel,
            pressed && styles.pressed,
          ]}
        >
          {key === "del" ? (
            <MaterialCommunityIcons color={colors.textMuted} name="backspace" size={22} />
          ) : (
            <Text style={styles.numpadText}>{key}</Text>
          )}
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  numpad: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
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
  numpadBtnDel: { backgroundColor: "#E5EEFF", elevation: 0, shadowOpacity: 0 },
  numpadText: { color: colors.text, fontSize: 22, fontFamily: interFonts.semibold },
  pressed: { opacity: 0.75 },
});
