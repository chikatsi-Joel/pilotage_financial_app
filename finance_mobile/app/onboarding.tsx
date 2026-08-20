import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandMark } from "../src/ui/components";
import { colors } from "../src/ui/theme";

export default function Onboarding() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <BrandMark />
          <View style={styles.copy}>
            <Text style={styles.title}>Bienvenue sur{`\n`}<Text style={styles.brand}>Pilotage</Text></Text>
            <Text style={styles.subtitle}>Prenez le contrôle de votre avenir financier avec une analyse intelligente et sereine.</Text>
          </View>
        </View>
        <View style={styles.bottom}>
          <View style={styles.dots}><View style={[styles.dot, styles.dotActive]} /><View style={styles.dot} /><View style={styles.dot} /></View>
          <Pressable onPress={() => router.replace("/dashboard")} style={styles.button}>
            <Text style={styles.buttonText}>Commencer</Text>
          </Pressable>
          <Text style={styles.helper}>Une vision plus claire, à votre rythme.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bottom: { gap: 18 },
  brand: { color: colors.primary },
  button: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 17, shadowColor: colors.primary, shadowOpacity: 0.22, shadowRadius: 12 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  content: { flex: 1, justifyContent: "space-between", padding: 24 },
  copy: { alignItems: "center", gap: 16 },
  dot: { backgroundColor: "#D4D1EE", borderRadius: 4, height: 7, width: 7 },
  dotActive: { backgroundColor: colors.primary, width: 24 },
  dots: { flexDirection: "row", gap: 7, justifyContent: "center" },
  helper: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
  hero: { alignItems: "center", flex: 1, justifyContent: "center", gap: 42 },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  subtitle: { color: colors.textMuted, fontSize: 17, lineHeight: 26, maxWidth: 325, textAlign: "center" },
  title: { color: colors.text, fontSize: 35, fontWeight: "800", letterSpacing: -1, textAlign: "center" },
});
