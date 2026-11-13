import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useRemoteFlags } from "../shared/config/remoteFlags";
import { colors, interFonts } from "./theme";

const DISMISSED_KEY = "lucia-dismissed-announcement";

/**
 * Annonce `announcement_text` de Remote Config, en tête de l'accueil.
 * Fermée par l'utilisateur, elle ne revient pas tant que le texte reste le même.
 */
export function AnnouncementBanner() {
  const announcement = useRemoteFlags((s) => s.announcement);
  // undefined = pas encore lu : on n'affiche rien pour éviter un clignotement.
  const [dismissed, setDismissed] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((value) => setDismissed(value))
      .catch(() => setDismissed(null));
  }, []);

  if (__DEV__) {
    console.log("[Annonce] texte:", JSON.stringify(announcement?.text ?? null), "fermée:", JSON.stringify(dismissed));
  }
  if (!announcement || dismissed === undefined || dismissed === announcement.text) return null;

  const close = () => {
    setDismissed(announcement.text);
    void AsyncStorage.setItem(DISMISSED_KEY, announcement.text).catch(() => undefined);
  };
  const link = announcement.link;

  return (
    <View style={styles.card}>
      <View pointerEvents="none" style={styles.orb} />
      <View style={styles.icon}>
        <MaterialCommunityIcons color="#FFFFFF" name="bullhorn-outline" size={18} />
      </View>
      <View style={styles.body}>
        <Text style={styles.text}>{announcement.text}</Text>
        {link ? (
          <Pressable
            accessibilityRole="link"
            hitSlop={8}
            onPress={() => void Linking.openURL(link).catch(() => undefined)}
          >
            <Text style={styles.link}>En savoir plus ›</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable accessibilityLabel="Fermer l'annonce" accessibilityRole="button" hitSlop={10} onPress={close}>
        <MaterialCommunityIcons color="#FFFFFFCC" name="close" size={18} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 20,
    flexDirection: "row",
    gap: 12,
    overflow: "hidden",
    padding: 14,
  },
  orb: {
    backgroundColor: "#FFFFFF14",
    borderRadius: 999,
    height: 120,
    position: "absolute",
    right: -40,
    top: -50,
    width: 120,
  },
  icon: {
    alignItems: "center",
    backgroundColor: "#FFFFFF26",
    borderRadius: 999,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  body: { flex: 1, gap: 6, paddingTop: 1 },
  text: { color: "#FFFFFF", fontFamily: interFonts.medium, fontSize: 14, lineHeight: 20 },
  link: { color: "#FFFFFF", fontFamily: interFonts.bold, fontSize: 13 },
});
