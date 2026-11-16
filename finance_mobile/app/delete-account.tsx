import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
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

import { auth } from "../src/shared/api/auth";
import { currentProvider, reauthenticate } from "../src/shared/auth/firebase";
import { endDeletedAccount } from "../src/shared/auth/signOut";
import { accountDeletionUrl, openPrivacyPolicy } from "../src/shared/config/legal";
import { ScreenHeader } from "../src/ui/components";
import { colors, interFonts } from "../src/ui/theme";

const CONFIRM_WORD = "SUPPRIMER";

const DELETED = [
  "Votre compte et votre profil",
  "Toutes vos dépenses, revenus et catégories",
  "Vos budgets, objectifs d'épargne et versements",
  "Vos analyses, recommandations et notifications",
];

/**
 * Suppression définitive du compte (exigence Play Store / App Store).
 * Deux garde-fous : taper SUPPRIMER, puis se ré-identifier (mot de passe ou Google).
 */
export default function DeleteAccount() {
  const provider = currentProvider();
  const needsPassword = provider !== "google.com";
  const [word, setWord] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Refus sans session Firebase sur l'appareil (compte Google, build sans Firebase…) :
  // on oriente vers une reconnexion ou la procédure web, au lieu d'une impasse.
  const [stuck, setStuck] = useState(false);

  const ready =
    word.trim().toUpperCase() === CONFIRM_WORD && (!needsPassword || password.length > 0) && !busy;

  async function confirm() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    setStuck(false);
    try {
      if (provider) {
        const idToken = await reauthenticate(needsPassword ? password : undefined);
        if (!idToken) return; // fenêtre Google fermée
        await auth.deleteAccount({ id_token: idToken });
      } else {
        await auth.deleteAccount({ password });
      }
      await endDeletedAccount();
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      const code = (e as { code?: string })?.code ?? "";
      const refused = status === 403 || code.includes("wrong-password") || code.includes("invalid-credential");
      if (refused && provider === null) {
        setStuck(true);
        setError(
          "Identification refusée. Si vous vous connectez avec Google, déconnectez-vous puis reconnectez-vous avant de réessayer.",
        );
      } else {
        setError(
          refused
            ? "Identification incorrecte. Vérifiez votre mot de passe et réessayez."
            : "Suppression impossible pour le moment. Vérifiez votre connexion et réessayez.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader title="Supprimer mon compte" />

          <View style={styles.warning}>
            <View pointerEvents="none" style={styles.orb} />
            <View style={styles.warningIcon}>
              <MaterialCommunityIcons color={colors.danger} name="alert-outline" size={22} />
            </View>
            <Text style={styles.warningTitle}>Action définitive</Text>
            <Text style={styles.warningText}>
              Votre compte et toutes vos données seront effacés immédiatement. Ils ne pourront pas être
              récupérés.
            </Text>
            <View style={styles.list}>
              {DELETED.map((item) => (
                <View key={item} style={styles.listRow}>
                  <MaterialCommunityIcons color={colors.danger} name="close-circle-outline" size={16} />
                  <Text style={styles.listText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>
              Tapez <Text style={styles.strong}>{CONFIRM_WORD}</Text> pour confirmer
            </Text>
            <TextInput
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!busy}
              onChangeText={setWord}
              placeholder={CONFIRM_WORD}
              placeholderTextColor={`${colors.textMuted}80`}
              style={styles.input}
              value={word}
            />
          </View>

          {needsPassword ? (
            <View style={styles.field}>
              <Text style={styles.label}>Votre mot de passe</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="current-password"
                editable={!busy}
                onChangeText={setPassword}
                secureTextEntry
                style={styles.input}
                value={password}
              />
            </View>
          ) : (
            <View style={styles.note}>
              <MaterialCommunityIcons color={colors.primary} name="google" size={16} />
              <Text style={styles.noteText}>
                Vous confirmerez votre identité avec votre compte Google.
              </Text>
            </View>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <MaterialCommunityIcons color={colors.danger} name="alert-circle-outline" size={16} />
              <View style={styles.flex}>
                <Text style={styles.errorText}>{error}</Text>
                {stuck ? (
                  <Text
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(accountDeletionUrl()).catch(() => undefined)}
                    style={styles.errorLink}
                  >
                    Autre méthode de suppression
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
            disabled={!ready}
            onPress={() => void confirm()}
            style={({ pressed }) => [styles.button, !ready && styles.buttonOff, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Supprimer définitivement</Text>
            )}
          </Pressable>

          <Pressable accessibilityRole="link" hitSlop={8} onPress={openPrivacyPolicy} style={styles.link}>
            <Text style={styles.linkText}>Politique de confidentialité</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  content: { gap: 18, padding: 20, paddingBottom: 40 },
  warning: {
    backgroundColor: "#FFF5F4",
    borderColor: "#F6D5D1",
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    overflow: "hidden",
    padding: 18,
    position: "relative",
  },
  orb: {
    backgroundColor: `${colors.danger}0D`,
    borderRadius: 999,
    height: 140,
    position: "absolute",
    right: -50,
    top: -60,
    width: 140,
  },
  warningIcon: {
    alignItems: "center",
    backgroundColor: "#FBE9E7",
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  warningTitle: { color: colors.text, fontFamily: interFonts.bold, fontSize: 17, marginTop: 4 },
  warningText: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 13, lineHeight: 19 },
  list: { gap: 8, marginTop: 6 },
  listRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  listText: { color: colors.text, flex: 1, fontFamily: interFonts.medium, fontSize: 13 },
  field: { gap: 8 },
  label: { color: colors.text, fontFamily: interFonts.semibold, fontSize: 13 },
  strong: { color: colors.danger, fontFamily: interFonts.bold },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1.5,
    color: colors.text,
    fontFamily: interFonts.regular,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  note: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    padding: 12,
  },
  noteText: { color: colors.primary, flex: 1, fontFamily: interFonts.semibold, fontSize: 12.5 },
  errorBox: {
    alignItems: "flex-start",
    backgroundColor: "#FBE9E7",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    padding: 12,
  },
  errorText: { color: colors.danger, fontFamily: interFonts.semibold, fontSize: 12, lineHeight: 17 },
  errorLink: {
    color: colors.danger,
    fontFamily: interFonts.bold,
    fontSize: 12,
    marginTop: 6,
    textDecorationLine: "underline",
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.danger,
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 52,
  },
  buttonOff: { opacity: 0.4 },
  buttonText: { color: "#FFFFFF", fontFamily: interFonts.bold, fontSize: 15 },
  pressed: { opacity: 0.85 },
  link: { alignSelf: "center", paddingVertical: 4 },
  linkText: { color: colors.primary, fontFamily: interFonts.semibold, fontSize: 12.5 },
});
