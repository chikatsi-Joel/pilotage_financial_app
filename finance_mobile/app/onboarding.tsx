import { useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth } from "../src/shared/api/auth";
import { saveToken } from "../src/shared/auth/session";
import { authErrorMessage, validateAuthForm } from "../src/shared/utils/authForm";
import { useAppStore } from "../src/shared/store";
import { BrandMark } from "../src/ui/components";
import { colors } from "../src/ui/theme";

type Mode = "login" | "register";

/** Connexion / création de compte. La session est ensuite conservée jusqu'à la déconnexion. */
export default function Onboarding() {
  const setAuth = useAppStore((s) => s.setAuth);
  const [mode, setMode] = useState<Mode>("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === "register";

  async function submit() {
    if (busy) return;
    const problem = validateAuthForm({ mode, name, email, password });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = isRegister
        ? await auth.register({ name: name.trim(), email: email.trim(), password, currency: "XAF" })
        : await auth.login({ email: email.trim(), password });
      await saveToken(res.token);
      setAuth(res.user.id, res.user.name, res.user.currency);
      router.replace("/dashboard");
    } catch (e) {
      setError(authErrorMessage(e));
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(isRegister ? "login" : "register");
    setError(null);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <BrandMark />
            <Text style={styles.title}>
              {isRegister ? "Créer votre compte" : "Bon retour sur"}
              {"\n"}
              {isRegister ? null : <Text style={styles.brand}>Pilotage</Text>}
            </Text>
            <Text style={styles.subtitle}>
              {isRegister
                ? "Vous resterez connecté sur cet appareil jusqu'à ce que vous vous déconnectiez."
                : "Connectez-vous pour retrouver vos finances."}
            </Text>
          </View>

          <View style={styles.form}>
            {isRegister && (
              <TextInput
                accessibilityLabel="Nom"
                autoCapitalize="words"
                autoComplete="name"
                onChangeText={setName}
                placeholder="Votre nom"
                placeholderTextColor="#9AA0B4"
                style={styles.input}
                value={name}
              />
            )}
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor="#9AA0B4"
              style={styles.input}
              value={email}
            />
            <View style={styles.passwordRow}>
              <TextInput
                accessibilityLabel="Mot de passe"
                autoCapitalize="none"
                autoComplete={isRegister ? "new-password" : "current-password"}
                autoCorrect={false}
                onChangeText={setPassword}
                onSubmitEditing={submit}
                placeholder="Mot de passe (8 caractères min.)"
                placeholderTextColor="#9AA0B4"
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
                value={password}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                hitSlop={8}
                onPress={() => setShowPassword((v) => !v)}
              >
                <Text style={styles.toggle}>{showPassword ? "Masquer" : "Afficher"}</Text>
              </Pressable>
            </View>

            {error && (
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {error}
              </Text>
            )}

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={submit}
              style={[styles.button, busy && styles.buttonDisabled]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>
                  {isRegister ? "Créer mon compte" : "Se connecter"}
                </Text>
              )}
            </Pressable>

            <Pressable accessibilityRole="button" onPress={switchMode} style={styles.switch}>
              <Text style={styles.switchText}>
                {isRegister ? "Déjà un compte ? " : "Pas encore de compte ? "}
                <Text style={styles.switchLink}>
                  {isRegister ? "Se connecter" : "Créer un compte"}
                </Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { flexGrow: 1, gap: 32, justifyContent: "center", padding: 24 },
  hero: { alignItems: "center", gap: 16 },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
    textAlign: "center",
  },
  brand: { color: colors.primary },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 320,
    textAlign: "center",
  },
  form: { gap: 12 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  passwordRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    paddingRight: 16,
  },
  passwordInput: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  toggle: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 17,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  switch: { alignItems: "center", paddingVertical: 8 },
  switchText: { color: colors.textMuted, fontSize: 14 },
  switchLink: { color: colors.primary, fontWeight: "800" },
});
