/**
 * Choix de la formule Premium (Google Play) : partagé par Paramètres et la carte de l'analyse
 * IA quand le quota gratuit est épuisé. Boutique indisponible (iOS, Google Play absent) :
 * demande par e-mail.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import type { PremiumPurchase } from "../shared/billing/usePremiumPurchase";
import { requestPremium } from "../shared/config/legal";
import { colors, interFonts } from "./theme";

export function PremiumPlans({ purchase }: { purchase: PremiumPurchase }) {
  const { phase, plans, message, buy, restore } = purchase;
  const busy = phase === "buying" || phase === "verifying";
  return (
    <View style={styles.wrap}>
      {phase === "loading" ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : phase === "unavailable" ? (
        <Pressable
          accessibilityRole="button"
          onPress={requestPremium}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
        >
          <Text style={styles.btnText}>Demander Premium</Text>
        </Pressable>
      ) : (
        <>
          {plans.map((plan, i) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              key={plan.basePlanId}
              onPress={() => void buy(plan)}
              style={({ pressed }) => [
                styles.btn,
                i > 0 && styles.btnAlt,
                (pressed || busy) && styles.pressed,
              ]}
            >
              <Text style={[styles.btnText, i > 0 && styles.btnAltText]}>
                {plan.label} · {plan.price}
              </Text>
            </Pressable>
          ))}
          {phase === "verifying" ? <Text style={styles.note}>Activation du Premium…</Text> : null}
          <Text style={styles.note}>
            Renouvellement automatique, résiliable à tout moment depuis Google Play.
          </Text>
          <Pressable accessibilityRole="button" disabled={busy} hitSlop={6} onPress={() => void restore()}>
            <Text style={styles.link}>Déjà abonné ? Restaurer mon achat</Text>
          </Pressable>
        </>
      )}
      {message ? <Text style={styles.error}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  loader: { marginVertical: 8 },
  btn: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 46,
  },
  btnText: { color: "#FFFFFF", fontFamily: interFonts.bold, fontSize: 14 },
  btnAlt: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1.5 },
  btnAltText: { color: colors.primary },
  pressed: { opacity: 0.75 },
  note: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 12, textAlign: "center" },
  link: { color: colors.primary, fontFamily: interFonts.semibold, fontSize: 13, textAlign: "center" },
  error: { color: colors.danger, fontFamily: interFonts.medium, fontSize: 13, textAlign: "center" },
});
