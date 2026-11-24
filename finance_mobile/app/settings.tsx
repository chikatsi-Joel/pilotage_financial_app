/**
 * Paramètres : page plein écran ouverte par l'icône profil de l'accueil (remplace l'ancienne
 * demi-feuille). En-tête profil, puis sections en listes groupées : Compte, Premium, Aide, déconnexion
 * (confirmée dans la page, sans boîte système) et suppression du compte.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth } from "../src/shared/api/auth";
import { users } from "../src/shared/api/users";
import { currentProvider } from "../src/shared/auth/firebase";
import { signOut } from "../src/shared/auth/signOut";
import { premiumUntilLabel, usePremiumPurchase } from "../src/shared/billing/usePremiumPurchase";
import { currencyInfo } from "../src/shared/config/currencies";
import { openPrivacyPolicy } from "../src/shared/config/legal";
import { useRemoteFlags } from "../src/shared/config/remoteFlags";
import { useAppStore } from "../src/shared/store";
import { initialsOf } from "../src/shared/utils/profile";
import { CurrencyList } from "../src/ui/CurrencyList";
import { PremiumPlans } from "../src/ui/PremiumPlans";
import { ScreenHeader } from "../src/ui/components";
import { colors, interFonts } from "../src/ui/theme";
import { useTour } from "../src/ui/tour/TourProvider";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const PROVIDER_LABEL: Record<string, string> = {
  "google.com": "Connecté avec Google",
  password: "Connecté avec e-mail et mot de passe",
};
const providerLabel = (p: string) => PROVIDER_LABEL[p] ?? "Compte connecté";

export default function Settings() {
  const name = useAppStore((s) => s.userName);
  const currency = useAppStore((s) => s.currency);
  const userId = useAppStore((s) => s.userId);
  const setCurrency = useAppStore((s) => s.setCurrency);
  const [pickingCurrency, setPickingCurrency] = useState(false);
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [currencyError, setCurrencyError] = useState<string | null>(null);

  const changeCurrency = useCallback(
    async (code: string) => {
      if (!userId || code === currency) {
        setPickingCurrency(false);
        return;
      }
      setSavingCurrency(true);
      setCurrencyError(null);
      try {
        const user = await users.update(userId, { currency: code });
        setCurrency(user.currency);
        setPickingCurrency(false);
      } catch {
        setCurrencyError("Devise non enregistrée. Vérifiez votre connexion et réessayez.");
      } finally {
        setSavingCurrency(false);
      }
    },
    [userId, currency, setCurrency],
  );
  const purchase = usePremiumPurchase(userId, () => undefined);
  const premium = purchase.status?.premium === true;
  const premiumUntil = premiumUntilLabel(purchase.status?.premium_until);
  const tour = useTour();
  // Visites coupées à distance (interrupteur de sécurité) : la ligne n'est pas proposée.
  const toursEnabled = useRemoteFlags((s) => s.tour.enabled);
  const confirmTitle = useRef<React.ComponentRef<typeof Text>>(null);

  const [email, setEmail] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    auth
      .me()
      .then((u) => {
        if (!cancelled) setEmail(u.email ?? null);
      })
      .catch(() => undefined); // e-mail non affiché si le serveur est injoignable
    return () => {
      cancelled = true;
    };
  }, []);

  const provider = currentProvider();
  const displayName = name?.trim() || "Mon compte";
  const version = Constants.expoConfig?.version ?? null;

  const replayTours = useCallback(async () => {
    // Remise à zéro puis retour à l'accueil : sa visite se relance d'elle-même (useAutoTour
    // réévalue les visites quand elles sont remises à zéro).
    await tour.resetAll();
    router.back();
  }, [tour]);

  // Lecteur d'écran : le focus va sur la confirmation dès qu'elle s'ouvre.
  useEffect(() => {
    if (!confirming) return;
    const node = findNodeHandle(confirmTitle.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [confirming]);

  const confirmSignOut = useCallback(async () => {
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <ScreenHeader title="Paramètres" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Profil ── */}
        <View accessible accessibilityLabel={`${displayName}${email ? `, ${email}` : ""}`} style={styles.profile}>
          <View pointerEvents="none" style={styles.orb} />
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsOf(displayName)}</Text>
          </View>
          <View style={styles.profileText}>
            <Text numberOfLines={1} style={styles.name}>{displayName}</Text>
            {email ? <Text numberOfLines={1} style={styles.email}>{email}</Text> : null}
            {provider ? <Text style={styles.provider}>{providerLabel(provider)}</Text> : null}
          </View>
        </View>

        {/* ── Compte ── */}
        <Section title="Compte">
          <Row icon="bell-outline" label="Notifications" onPress={() => router.push("/notifications")} />
          <Row icon="briefcase-outline" label="Sources de revenus" onPress={() => router.push("/income-sources")} />
          <Row
            icon="currency-usd"
            label="Devise"
            last={!pickingCurrency}
            onPress={() => setPickingCurrency((v) => !v)}
            value={currencyInfo(currency).label}
          />
          {pickingCurrency ? (
            <View style={styles.currencyPanel}>
              <Text style={styles.currencyNote}>
                Seule l'unité affichée change : les montants déjà saisis ne sont pas convertis.
              </Text>
              <CurrencyList disabled={savingCurrency} onSelect={(c) => void changeCurrency(c)} value={currency} />
              {currencyError ? <Text style={styles.currencyError}>{currencyError}</Text> : null}
            </View>
          ) : null}
        </Section>

        {/* ── Premium ── */}
        <Section title="Premium">
          {premium ? (
            <>
              <Row
                icon="crown-outline"
                label="Premium actif"
                last={!purchase.status?.subscription || !purchase.storeAvailable}
                value={premiumUntil ? `jusqu'au ${premiumUntil}` : undefined}
              />
              {purchase.status?.subscription && purchase.storeAvailable ? (
                <Row icon="cog-outline" label="Gérer l'abonnement" onPress={purchase.manage} last />
              ) : null}
            </>
          ) : (
            <View style={styles.premium}>
              <View style={styles.premiumHeader}>
                <View style={[styles.rowIcon, { backgroundColor: `${colors.primary}14` }]}>
                  <MaterialCommunityIcons color={colors.primary} name="crown-outline" size={18} />
                </View>
                <View style={styles.premiumHeaderText}>
                  <Text style={styles.premiumTitle}>Passer à Premium</Text>
                  <Text style={styles.premiumText}>Analyses IA illimitées, chaque mois.</Text>
                </View>
              </View>
              <PremiumPlans purchase={purchase} />
            </View>
          )}
        </Section>

        {/* ── Aide ── */}
        <Section title="Aide">
          {toursEnabled ? (
            <Row icon="compass-outline" label="Revoir les visites guidées" onPress={() => void replayTours()} />
          ) : null}
          <Row icon="shield-lock-outline" label="Politique de confidentialité" onPress={openPrivacyPolicy} last />
        </Section>

        {/* ── Déconnexion (confirmée dans la page) ── */}
        <View style={styles.group}>
          {confirming ? (
            <View style={styles.confirm}>
              <Text accessibilityRole="header" ref={confirmTitle} style={styles.confirmTitle}>
                Se déconnecter ?
              </Text>
              <Text style={styles.confirmText}>
                Vos données restent enregistrées ; reconnectez-vous pour les retrouver.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  accessibilityLabel="Annuler"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => setConfirming(false)}
                  style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
                >
                  <Text style={styles.btnGhostText}>Annuler</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Se déconnecter"
                  accessibilityRole="button"
                  accessibilityState={{ busy, disabled: busy }}
                  disabled={busy}
                  onPress={() => void confirmSignOut()}
                  style={({ pressed }) => [styles.btn, styles.btnDanger, pressed && styles.pressed]}
                >
                  {busy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.btnDangerText}>Se déconnecter</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <Row icon="logout" label="Se déconnecter" danger onPress={() => setConfirming(true)} last />
          )}
        </View>

        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => router.push("/delete-account")}
          style={styles.deleteLink}
        >
          <Text style={styles.deleteText}>Supprimer mon compte</Text>
        </Pressable>

        {version ? <Text style={styles.version}>Lucia · version {version}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════
//  LISTES GROUPÉES
// ═══════════════════════════════════════════════════════════

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  danger,
  last,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const tint = danger ? colors.danger : colors.primary;
  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: `${tint}14` }]}>
        <MaterialCommunityIcons color={tint} name={icon} size={18} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress && !danger ? (
        <MaterialCommunityIcons color={colors.textMuted} name="chevron-right" size={20} />
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={`${label}${value ? ` : ${value}` : ""}`} style={[styles.row, !last && styles.rowDivider]}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  scroll: { gap: 22, paddingBottom: 48, paddingHorizontal: 18, paddingTop: 4 },

  profile: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: "#ECEEF4",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    overflow: "hidden",
    padding: 18,
    position: "relative",
  },
  orb: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 150,
    opacity: 0.06,
    position: "absolute",
    right: -50,
    top: -70,
    width: 150,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 30,
    height: 60,
    justifyContent: "center",
    width: 60,
  },
  avatarText: { color: "#FFFFFF", fontFamily: interFonts.bold, fontSize: 20 },
  profileText: { flex: 1, gap: 2 },
  name: { color: colors.text, fontFamily: interFonts.bold, fontSize: 17 },
  email: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 13 },
  provider: { color: colors.primary, fontFamily: interFonts.medium, fontSize: 12, marginTop: 2 },

  section: { gap: 8 },
  sectionTitle: {
    color: colors.textMuted,
    fontFamily: interFonts.semibold,
    fontSize: 11.5,
    letterSpacing: 0.6,
    paddingHorizontal: 4,
    textTransform: "uppercase",
  },
  group: {
    backgroundColor: colors.surface,
    borderColor: "#ECEEF4",
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 56, paddingHorizontal: 14 },
  rowDivider: { borderBottomColor: "#F0F1F6", borderBottomWidth: 1 },
  rowPressed: { backgroundColor: "#F6F5FF" },
  rowIcon: { alignItems: "center", borderRadius: 10, height: 34, justifyContent: "center", width: 34 },
  rowLabel: { color: colors.text, flex: 1, fontFamily: interFonts.medium, fontSize: 14.5 },
  rowValue: { color: colors.textMuted, fontFamily: interFonts.semibold, fontSize: 13.5 },

  currencyPanel: { borderTopColor: "#F0F1F6", borderTopWidth: 1, paddingTop: 10 },
  currencyNote: {
    color: colors.textMuted,
    fontFamily: interFonts.regular,
    fontSize: 12.5,
    lineHeight: 18,
    paddingBottom: 6,
    paddingHorizontal: 14,
  },
  currencyError: { color: colors.danger, fontFamily: interFonts.medium, fontSize: 13, padding: 14 },

  premium: { gap: 14, padding: 16 },
  premiumHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
  premiumHeaderText: { flex: 1, gap: 2 },
  premiumTitle: { color: colors.text, fontFamily: interFonts.bold, fontSize: 14.5 },
  premiumText: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 13 },

  confirm: { gap: 10, padding: 16 },
  confirmTitle: { color: colors.text, fontFamily: interFonts.bold, fontSize: 15 },
  confirmText: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 13, lineHeight: 19 },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  btn: { alignItems: "center", borderRadius: 12, flex: 1, justifyContent: "center", minHeight: 46 },
  btnGhost: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 },
  btnGhostText: { color: colors.text, fontFamily: interFonts.semibold, fontSize: 14 },
  btnDanger: { backgroundColor: colors.danger },
  btnDangerText: { color: "#FFFFFF", fontFamily: interFonts.bold, fontSize: 14 },
  pressed: { opacity: 0.85 },

  deleteLink: { alignSelf: "center", paddingVertical: 6 },
  deleteText: {
    color: colors.danger,
    fontFamily: interFonts.semibold,
    fontSize: 13,
    textDecorationLine: "underline",
  },
  version: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 11.5, textAlign: "center" },
});
