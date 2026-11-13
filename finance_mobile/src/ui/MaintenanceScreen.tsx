import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, fonts, interFonts } from "./theme";

/**
 * Écran plein affiché quand `maintenance_enabled` est actif dans Remote Config.
 * Pas de bouton « Réessayer » : l'écoute temps réel rouvre l'app dès que l'interrupteur est coupé.
 */
export function MaintenanceScreen({ message }: { message: string }) {
  return (
    <SafeAreaView style={styles.root}>
      <View pointerEvents="none" style={styles.orbTop} />
      <View pointerEvents="none" style={styles.orbBottom} />

      <View style={styles.content}>
        <View style={styles.iconRing}>
          <View style={styles.icon}>
            <MaterialCommunityIcons color={colors.primary} name="hammer-wrench" size={34} />
          </View>
        </View>
        <Text style={styles.title}>Lucia fait peau neuve</Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.hint}>
          <View style={styles.hintDot} />
          <Text style={styles.hintText}>L'application se rouvrira toute seule</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: "#EEF1FF", flex: 1, overflow: "hidden" },
  orbTop: {
    backgroundColor: `${colors.primary}14`,
    borderRadius: 999,
    height: 320,
    position: "absolute",
    right: -120,
    top: -110,
    width: 320,
  },
  orbBottom: {
    backgroundColor: "#865DD210",
    borderRadius: 999,
    bottom: -90,
    height: 240,
    left: -90,
    position: "absolute",
    width: 240,
  },
  content: { alignItems: "center", flex: 1, gap: 14, justifyContent: "center", paddingHorizontal: 32 },
  iconRing: { borderColor: `${colors.primary}33`, borderRadius: 999, borderWidth: 2, padding: 6 },
  icon: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 999,
    height: 84,
    justifyContent: "center",
    width: 84,
  },
  title: { color: colors.text, fontFamily: fonts.bold, fontSize: 22, marginTop: 6, textAlign: "center" },
  message: {
    color: colors.textMuted,
    fontFamily: interFonts.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  hint: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 99,
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  hintDot: { backgroundColor: colors.primary, borderRadius: 4, height: 8, width: 8 },
  hintText: { color: colors.primary, fontFamily: interFonts.semibold, fontSize: 12 },
});
