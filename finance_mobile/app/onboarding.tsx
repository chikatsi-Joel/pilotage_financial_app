import { forwardRef, useEffect, useRef, useState } from "react";
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
  type TextInputProps,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth } from "../src/shared/api/auth";
import { saveToken } from "../src/shared/auth/session";
import { registerForPush } from "../src/shared/notifications/push";
import {
  CODE_LENGTH,
  MIN_PASSWORD_LENGTH,
  authErrorMessage,
  isCodeComplete,
  sanitizeCode,
  validateAuthForm,
} from "../src/shared/utils/authForm";
import { useAppStore } from "../src/shared/store";
import { BrandMark } from "../src/ui/components";
import { colors } from "../src/ui/theme";

type Mode = "login" | "register" | "verify";
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type InputHandle = React.ComponentRef<typeof TextInput>;

const RESEND_SECONDS = 60;
const PLACEHOLDER = "#9AA0B4";

/** Connexion / création de compte. La session est ensuite conservée jusqu'à la déconnexion. */
export default function Onboarding() {
  const setAuth = useAppStore((s) => s.setAuth);
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const emailRef = useRef<InputHandle>(null);
  const passwordRef = useRef<InputHandle>(null);
  const codeRef = useRef<InputHandle>(null);

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
    void registerForPush(res.user.id);
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
        goVerify("Saisissez le code à 6 chiffres reçu par email.");
        setBusy(false);
        return;
      }
      await finish(await auth.login({ email: email.trim(), password }));
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (!isRegister && status === 403) {
        goVerify("Votre email n'est pas encore vérifié. Saisissez le code reçu par email.");
      } else {
        setError(authErrorMessage(e));
      }
      setBusy(false);
    }
  }

  function selectMode(next: "login" | "register") {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setInfo(null);
  }

  const codeComplete = isCodeComplete(code);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View pointerEvents="none" style={styles.decorTop} />
      <View pointerEvents="none" style={styles.decorBottom} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Marque ── */}
          <View style={styles.hero}>
            <BrandMark small />
            <Text style={styles.brand}>Lucia</Text>
            <Text style={styles.tagline}>Vos finances, sous contrôle.</Text>
          </View>

          <View style={styles.card}>
            {isVerify ? (
              /* ── Vérification de l'email ── */
              <View style={styles.form}>
                <View style={styles.verifyIcon}>
                  <MaterialCommunityIcons color={colors.primary} name="email-check-outline" size={28} />
                </View>
                <View style={styles.headings}>
                  <Text style={styles.title}>Vérifiez votre email</Text>
                  <Text style={styles.subtitle}>
                    {info}
                    {"\n"}
                    <Text style={styles.emailStrong}>{email.trim()}</Text>
                  </Text>
                </View>

                <Pressable
                  accessibilityLabel="Code de vérification"
                  onPress={() => codeRef.current?.focus()}
                  style={styles.codeRow}
                >
                  {Array.from({ length: CODE_LENGTH }, (_, i) => {
                    const filled = i < code.length;
                    const current = i === code.length && !codeComplete;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.codeBox,
                          filled && styles.codeBoxFilled,
                          current && styles.codeBoxCurrent,
                        ]}
                      >
                        <Text style={styles.codeDigit}>{code[i] ?? ""}</Text>
                      </View>
                    );
                  })}
                  <TextInput
                    ref={codeRef}
                    autoComplete="one-time-code"
                    autoFocus
                    caretHidden
                    keyboardType="number-pad"
                    maxLength={CODE_LENGTH}
                    onChangeText={(v) => setCode(sanitizeCode(v))}
                    onSubmitEditing={submitCode}
                    style={styles.codeHidden}
                    textContentType="oneTimeCode"
                    value={code}
                  />
                </Pressable>

                <ErrorBanner message={error} />

                <PrimaryButton
                  busy={busy}
                  disabled={!codeComplete}
                  label="Valider"
                  onPress={submitCode}
                />

                <View style={styles.verifyLinks}>
                  <Pressable accessibilityRole="button" disabled={cooldown > 0} hitSlop={8} onPress={resend}>
                    <Text style={[styles.link, cooldown > 0 && styles.linkMuted]}>
                      {cooldown > 0 ? `Renvoyer le code (${cooldown} s)` : "Renvoyer le code"}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => {
                      setMode("register");
                      setInfo(null);
                      setError(null);
                    }}
                  >
                    <Text style={styles.linkMuted}>Changer d'email</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              /* ── Connexion / Inscription ── */
              <View style={styles.form}>
                <View accessibilityRole="tablist" style={styles.tabs}>
                  {(
                    [
                      { key: "login", label: "Connexion" },
                      { key: "register", label: "Inscription" },
                    ] as const
                  ).map((t) => {
                    const active = mode === t.key;
                    return (
                      <Pressable
                        key={t.key}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        onPress={() => selectMode(t.key)}
                        style={[styles.tab, active && styles.tabActive]}
                      >
                        <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.headings}>
                  <Text style={styles.title}>
                    {isRegister ? "Créer votre compte" : "Bon retour 👋"}
                  </Text>
                  <Text style={styles.subtitle}>
                    {isRegister
                      ? "Quelques secondes suffisent pour commencer à suivre vos dépenses."
                      : "Connectez-vous pour retrouver vos finances."}
                  </Text>
                </View>

                {isRegister && (
                  <Field
                    autoCapitalize="words"
                    autoComplete="name"
                    icon="account-outline"
                    label="Nom"
                    onChangeText={setName}
                    onSubmitEditing={() => emailRef.current?.focus()}
                    placeholder="Votre nom"
                    returnKeyType="next"
                    submitBehavior="submit"
                    value={name}
                  />
                )}
                <Field
                  ref={emailRef}
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  icon="email-outline"
                  keyboardType="email-address"
                  label="Email"
                  onChangeText={setEmail}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  placeholder="vous@exemple.com"
                  returnKeyType="next"
                  submitBehavior="submit"
                  value={email}
                />
                <Field
                  ref={passwordRef}
                  autoCapitalize="none"
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  autoCorrect={false}
                  hint={isRegister ? `${MIN_PASSWORD_LENGTH} caractères minimum` : undefined}
                  icon="lock-outline"
                  label="Mot de passe"
                  onChangeText={setPassword}
                  onSubmitEditing={submit}
                  placeholder="••••••••"
                  returnKeyType="go"
                  right={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      hitSlop={10}
                      onPress={() => setShowPassword((v) => !v)}
                    >
                      <MaterialCommunityIcons
                        color={colors.textMuted}
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                      />
                    </Pressable>
                  }
                  secureTextEntry={!showPassword}
                  value={password}
                />

                <ErrorBanner message={error} />

                <PrimaryButton
                  busy={busy}
                  label={isRegister ? "Créer mon compte" : "Se connecter"}
                  onPress={submit}
                />
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <MaterialCommunityIcons color={colors.textMuted} name="shield-check-outline" size={14} />
            <Text style={styles.footerText}>
              Vous restez connecté sur cet appareil jusqu'à la déconnexion.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/*  Sous-composants                                                    */
/* ------------------------------------------------------------------ */

interface FieldProps extends TextInputProps {
  label: string;
  icon: IconName;
  hint?: string;
  right?: React.ReactNode;
}

/** Champ avec libellé, icône, état de focus et aide facultative. */
const Field = forwardRef<InputHandle, FieldProps>(function Field(
  { label, icon, hint, right, onFocus, onBlur, ...input },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputRow, focused && styles.inputRowFocused]}>
        <MaterialCommunityIcons
          color={focused ? colors.primary : colors.textMuted}
          name={icon}
          size={20}
        />
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          placeholderTextColor={PLACEHOLDER}
          style={styles.input}
          {...input}
        />
        {right}
      </View>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
});

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View accessibilityLiveRegion="polite" style={styles.errorBox}>
      <MaterialCommunityIcons color={colors.danger} name="alert-circle-outline" size={18} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  busy,
  disabled = false,
  onPress,
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const off = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [styles.button, off && styles.buttonDisabled, pressed && styles.buttonPressed]}
    >
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  decorTop: {
    backgroundColor: `${colors.primary}14`,
    borderRadius: 999,
    height: 280,
    position: "absolute",
    right: -110,
    top: -90,
    width: 280,
  },
  decorBottom: {
    backgroundColor: "#865DD210",
    borderRadius: 999,
    bottom: -70,
    height: 200,
    left: -80,
    position: "absolute",
    width: 200,
  },
  content: { flexGrow: 1, gap: 24, justifyContent: "center", padding: 20 },

  hero: { alignItems: "center", gap: 6 },
  brand: { color: colors.primary, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginTop: 6 },
  tagline: { color: colors.textMuted, fontSize: 14 },

  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    elevation: 3,
    padding: 20,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  form: { gap: 16 },

  tabs: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    flexDirection: "row",
    padding: 4,
  },
  tab: { alignItems: "center", borderRadius: 11, flex: 1, paddingVertical: 10 },
  tabActive: {
    backgroundColor: colors.surface,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  tabText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  tabTextActive: { color: colors.primary, fontWeight: "700" },

  headings: { gap: 4 },
  title: { color: colors.text, fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  emailStrong: { color: colors.text, fontWeight: "700" },

  field: { gap: 6 },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: "600" },
  fieldHint: { color: colors.textMuted, fontSize: 12 },
  inputRow: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
  },
  inputRowFocused: { backgroundColor: colors.surface, borderColor: colors.primary },
  input: { color: colors.text, flex: 1, fontSize: 16, paddingVertical: 13 },

  errorBox: {
    alignItems: "flex-start",
    backgroundColor: "#FBE9E7",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    padding: 12,
  },
  errorText: { color: colors.danger, flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 18 },

  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 52,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },

  verifyIcon: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  codeRow: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  codeBox: {
    alignItems: "center",
    aspectRatio: 0.85,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1.5,
    flex: 1,
    justifyContent: "center",
  },
  codeBoxFilled: { backgroundColor: colors.surface, borderColor: `${colors.primary}66` },
  codeBoxCurrent: { borderColor: colors.primary },
  codeDigit: { color: colors.text, fontSize: 22, fontWeight: "800" },
  codeHidden: { ...StyleSheet.absoluteFill, color: "transparent", opacity: 0.01 },
  verifyLinks: { alignItems: "center", gap: 14, paddingTop: 2 },
  link: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  linkMuted: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },

  footer: { alignItems: "center", flexDirection: "row", gap: 6, justifyContent: "center" },
  footerText: { color: colors.textMuted, fontSize: 12 },
});
