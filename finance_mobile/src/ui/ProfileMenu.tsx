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

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

interface Props {
  visible: boolean;
  name: string | null;
  onClose: () => void;
  onNotifications: () => void;
  onSignOut: () => void | Promise<void>;
}

const OPEN_MS = 240;
const CLOSE_MS = 180;

/**
 * Menu du compte : feuille qui monte du bas de l'écran.
 * La déconnexion demande une confirmation dans la feuille (pas de boîte système).
 */
export function ProfileMenu({ visible, name, onClose, onNotifications, onSignOut }: Props) {
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
          <View style={styles.handle} />

          <View style={styles.profile}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initialsOf(name)}</Text>
            </View>
            <View style={styles.profileCopy}>
              <Text numberOfLines={1} style={styles.name}>
                {displayName}
              </Text>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.status}>Session active sur cet appareil</Text>
              </View>
            </View>
          </View>

          {confirming ? (
            <View style={styles.confirm}>
              <View style={styles.confirmIcon}>
                <MaterialCommunityIcons color={colors.danger} name="logout" size={24} />
              </View>
              <Text style={styles.confirmTitle}>Se déconnecter de Lucia ?</Text>
              <Text style={styles.confirmText}>
                Vous devrez saisir à nouveau votre e-mail et votre mot de passe pour
                retrouver votre compte.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => setConfirming(false)}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnGhost,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.btnGhostText}>Annuler</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void confirmSignOut()}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnDanger,
                    pressed && styles.pressed,
                  ]}
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
            <View style={styles.list}>
              <Row
                icon="bell-outline"
                onPress={() => closeThen(onNotifications)}
                subtitle="Alertes, rappels et résumés"
                title="Notifications"
              />
              <View style={styles.separator} />
              <Row
                danger
                icon="logout"
                onPress={() => setConfirming(true)}
                title="Se déconnecter"
              />
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

function Row({
  icon,
  title,
  subtitle,
  danger = false,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const tint = danger ? colors.danger : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? "#FBE9E7" : colors.primarySoft }]}>
        <MaterialCommunityIcons color={tint} name={icon} size={22} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, danger && { color: colors.danger }]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {danger ? null : (
        <MaterialCommunityIcons color={colors.textMuted} name="chevron-right" size={22} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(11, 28, 48, 0.45)" },
  sheet: {
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    elevation: 16,
    gap: 16,
    maxWidth: 520,
    paddingHorizontal: 20,
    paddingTop: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    width: "100%",
  },
  handle: {
    alignSelf: "center",
    backgroundColor: colors.border,
    borderRadius: 99,
    height: 4,
    width: 40,
  },
  profile: { alignItems: "center", flexDirection: "row", gap: 14 },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  avatarText: { color: "#FFFFFF", fontSize: 18, fontFamily: interFonts.bold, letterSpacing: 0.5 },
  profileCopy: { flex: 1, gap: 4 },
  name: { color: colors.text, fontSize: 17, fontFamily: interFonts.bold },
  statusRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  statusDot: { backgroundColor: colors.success, borderRadius: 4, height: 8, width: 8 },
  status: { color: colors.textMuted, fontSize: 12, fontFamily: interFonts.regular },

  list: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  separator: { backgroundColor: colors.border, height: 1, marginLeft: 68 },
  row: { alignItems: "center", flexDirection: "row", gap: 14, padding: 14 },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowIcon: {
    alignItems: "center",
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 15, fontFamily: interFonts.semibold },
  rowSub: { color: colors.textMuted, fontSize: 11, fontFamily: interFonts.regular },

  confirm: { alignItems: "center", gap: 10, paddingVertical: 4 },
  confirmIcon: {
    alignItems: "center",
    backgroundColor: "#FBE9E7",
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  confirmTitle: { color: colors.text, fontSize: 17, fontFamily: interFonts.bold },
  confirmText: {
    color: colors.textMuted,
    fontSize: 13, fontFamily: interFonts.regular,
    lineHeight: 18,
    textAlign: "center",
  },
  confirmActions: { alignSelf: "stretch", flexDirection: "row", gap: 12, marginTop: 8 },
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
