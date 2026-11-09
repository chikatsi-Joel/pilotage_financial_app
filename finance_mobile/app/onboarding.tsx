import { useEffect, useState } from "react";
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
import {
  authErrorMessage,
  isCodeComplete,
  sanitizeCode,
  validateAuthForm,
} from "../src/shared/utils/authForm";
import { useAppStore } from "../src/shared/store";
import { BrandMark } from "../src/ui/components";
import { colors } from "../src/ui/theme";

type Mode = "login" | "register" | "verify";

const RESEND_SECONDS = 60;

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
  const [info, setInfo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const isRegister = mode === "register";
  const isVerify = mode === "verify";

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function goVerify(message: string) {
    setMode("verify");
    setCode("");
    setError(null);
    setInfo(message);
    setCooldown(RESEND_SECONDS);
  }

  async function finish(res: { token: string; user: { id: string; name: string; currency: string } }) {
    await saveToken(res.token);
    setAuth(res.user.id, res.user.name, res.user.currency);
    router.replace("/dashboard");
  }

  async function submitCode() {
    if (busy || !isCodeComplete(code)) return;
    setBusy(true);
    setError(null);
    try {
      await finish(await auth.verify({ email: email.trim(), code }));
    } catch (e) {
      setError(authErrorMessage(e));
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0 || busy) return;
    setError(null);
    try {
      await auth.resend(email.trim());
      setInfo("Un nouveau code a été envoyé.");
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      setError(authErrorMessage(e));
    }
  }

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
      if (isRegister) {
        await auth.register({ name: name.trim(), email: email.trim(), password, currency: "XAF" });
        goVerify(`Un code à 6 chiffres a été envoyé à ${email.trim()}.`);
        setBusy(false);
        return;
      }
      await finish(await auth.login({ email: email.trim(), password }));
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (!isRegister && status === 403) {
        goVerify("Votre email n'est pas encore vérifié. Un code vous a été envoyé.");
      } else {
        setError(authErrorMessage(e));
      }
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(isRegister ? "login" : "register");
    setError(null);
    setInfo(null);
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
              {isVerify ? "Vérifiez votre email" : isRegister ? "Créer votre compte" : "Bon retour sur"}
              {"\n"}
              {isRegister || isVerify ? null : <Text style={styles.brand}>Pilotage</Text>}
            </Text>
            <Text style={styles.subtitle}>
              {isVerify
                ? info
                : isRegister
                ? "Vous resterez connecté sur cet appareil jusqu'à ce que vous vous déconnectiez."
                : "Connectez-vous pour retrouver vos finances."}
            </Text>
          </View>

          {isVerify ? (
            <View style={styles.form}>
              <TextInput
                accessibilityLabel="Code de vérification"
                autoComplete="one-time-code"
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={(v) => setCode(sanitizeCode(v))}
                onSubmitEditing={submitCode}
                placeholder="000000"
                placeholderTextColor="#9AA0B4"
                style={[styles.input, styles.codeInput]}
                textContentType="oneTimeCode"
                value={code}
              />
              {error && (
                <Text accessibilityLiveRegion="polite" style={styles.error}>
                  {error}
                </Text>
              )}
              <Pressable
                accessibilityRole="button"
                disabled={busy || !isCodeComplete(code)}
                onPress={submitCode}
                style={[styles.button, (busy || !isCodeComplete(code)) && styles.buttonDisabled]}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Valider</Text>
                )}
              </Pressable>
              <Pressable accessibilityRole="button" disabled={cooldown > 0} onPress={resend} style={styles.switch}>
                <Text style={styles.switchText}>
                  {cooldown > 0 ? `Renvoyer le code dans ${cooldown} s` : <Text style={styles.switchLink}>Renvoyer le code</Text>}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setMode("register");
                  setInfo(null);
                  setError(null);
                }}
                style={styles.switch}
              >
                <Text style={styles.switchText}>Changer d'email</Text>
              </Pressable>
            </View>
          ) : (
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
          )}
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
  codeInput: { fontSize: 28, fontWeight: "800", letterSpacing: 8, textAlign: "center" },
  switch: { alignItems: "center", paddingVertical: 8 },
  switchText: { color: colors.textMuted, fontSize: 14 },
  switchLink: { color: colors.primary, fontWeight: "800" },
});
