import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { initialsOf } from "../shared/utils/profile";
import { colors } from "./theme";
import { interFonts } from "./theme";

interface Props {
  visible: boolean;
  name: string | null;
  onClose: () => void;
  onNotifications: () => void;
  /** Remet les visites guidées à zéro et relance celle de l'accueil. */
  onTour: () => void;
  onSignOut: () => void | Promise<void>;
}

const OPEN_MS = 240;
const CLOSE_MS = 180;

/**
 * Menu du compte : feuille qui monte du bas de l'écran.
 * La déconnexion demande une confirmation dans la feuille (pas de boîte système).
 */
export function ProfileMenu({ visible, name, onClose, onNotifications, onTour, onSignOut }: Props) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setConfirming(false);
      setBusy(false);
      Animated.timing(progress, {
        toValue: 1,
        duration: OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: CLOSE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, progress]);

  const closeThen = useCallback(
    (action: () => void) => {
      onClose();
      setTimeout(action, CLOSE_MS + 20);
    },
    [onClose],
  );

  const back = useCallback(() => {
    if (busy) return;
    if (confirming) setConfirming(false);
    else onClose();
  }, [busy, confirming, onClose]);

  const confirmSignOut = useCallback(async () => {
    setBusy(true);
    try {
      await onSignOut();
    } finally {
      setBusy(false);
      onClose();
    }
  }, [onSignOut, onClose]);

  if (!mounted) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [360, 0] });
  const displayName = name?.trim() || "Mon compte";

  return (
    <Modal
      animationType="none"
      onRequestClose={back}
      statusBarTranslucent
      transparent
      visible
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable
            accessibilityLabel="Fermer le menu"
            accessibilityRole="button"
            onPress={back}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 12) + 12, transform: [{ translateY }] },
          ]}
        >
          <View pointerEvents="none" style={styles.orbTop} />
          <View pointerEvents="none" style={styles.orbBottom} />
          <View style={styles.handle} />

          <View style={styles.profile}>
            <View style={styles.avatarRing}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initialsOf(name)}</Text>
              </View>
            </View>
            <Text numberOfLines={1} style={styles.name}>
              {displayName}
            </Text>
          </View>

          {confirming ? (
            <View style={styles.confirm}>
              <Text style={styles.confirmTitle}>Se déconnecter ?</Text>
              <Text style={styles.confirmText}>
                Il faudra vous reconnecter pour retrouver votre compte.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => setConfirming(false)}
                  style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
                >
                  <Text style={styles.btnGhostText}>Annuler</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
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
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => closeThen(onNotifications)}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <View style={styles.cardIcon}>
                  <MaterialCommunityIcons color={colors.primary} name="bell-outline" size={20} />
                </View>
                <Text style={styles.cardTitle}>Notifications</Text>
                <MaterialCommunityIcons color={colors.primary} name="chevron-right" size={22} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => closeThen(onTour)}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <View style={styles.cardIcon}>
                  <MaterialCommunityIcons color={colors.primary} name="map-marker-path" size={20} />
                </View>
                <Text style={styles.cardTitle}>Revoir les visites guidées</Text>
                <MaterialCommunityIcons color={colors.primary} name="chevron-right" size={22} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirming(true)}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <View style={[styles.cardIcon, styles.cardIconDanger]}>
                  <MaterialCommunityIcons color={colors.danger} name="logout" size={20} />
                </View>
                <Text style={[styles.cardTitle, { color: colors.danger }]}>Se déconnecter</Text>
              </Pressable>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(11, 28, 48, 0.45)" },
  sheet: {
    alignSelf: "center",
    backgroundColor: "#EEF1FF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    elevation: 16,
    gap: 18,
    maxWidth: 520,
    overflow: "hidden",
    paddingHorizontal: 20,
    paddingTop: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    width: "100%",
  },
  orbTop: {
    backgroundColor: `${colors.primary}14`,
    borderRadius: 999,
    height: 200,
    position: "absolute",
    right: -70,
    top: -80,
    width: 200,
  },
  orbBottom: {
    backgroundColor: "#865DD210",
    borderRadius: 999,
    bottom: -50,
    height: 150,
    left: -50,
    position: "absolute",
    width: 150,
  },
  handle: {
    alignSelf: "center",
    backgroundColor: `${colors.primary}33`,
    borderRadius: 99,
    height: 4,
    width: 40,
  },
  profile: { alignItems: "center", gap: 10 },
  avatarRing: {
    borderColor: `${colors.primary}40`,
    borderRadius: 999,
    borderWidth: 2,
    padding: 4,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 68,
    justifyContent: "center",
    width: 68,
  },
  avatarText: { color: "#FFFFFF", fontSize: 22, fontFamily: interFonts.bold, letterSpacing: 0.5 },
  name: { color: colors.text, fontSize: 18, fontFamily: interFonts.bold },

  actions: { gap: 10 },
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 18,
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 1,
  },
  cardIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  cardIconDanger: { backgroundColor: "#FBE9E7" },
  cardTitle: { color: colors.text, flex: 1, fontSize: 15, fontFamily: interFonts.semibold },

  confirm: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    gap: 6,
    padding: 16,
  },
  confirmTitle: { color: colors.text, fontSize: 16, fontFamily: interFonts.bold },
  confirmText: { color: colors.textMuted, fontSize: 13, fontFamily: interFonts.regular, lineHeight: 18 },
  confirmActions: { flexDirection: "row", gap: 12, marginTop: 10 },
  btn: {
    alignItems: "center",
    borderRadius: 14,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingVertical: 12,
  },
  btnGhost: { backgroundColor: colors.primarySoft },
  btnGhostText: { color: colors.primary, fontSize: 14, fontFamily: interFonts.bold },
  btnDanger: { backgroundColor: colors.danger },
  btnDangerText: { color: "#FFFFFF", fontSize: 14, fontFamily: interFonts.bold },
  pressed: { opacity: 0.85 },
});
