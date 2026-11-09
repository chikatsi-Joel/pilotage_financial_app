import { useCallback, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { colors } from "../../src/ui/theme";
import { analytics } from "../../src/shared/api/analytics";
import { useAppStore } from "../../src/shared/store";
import { signOut } from "../../src/shared/auth/signOut";
import type { CategoryAnalytics, Dashboard } from "../../src/shared/types";
import { formatMoney } from "../../src/shared/utils/money";
import { formatPct } from "../../src/shared/utils/format";
import { MONTHS_FR } from "../../src/shared/utils/date";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const CATEGORY_ICON: Record<string, IconName> = {
  Restaurants: "silverware-fork-knife",
  Alimentation: "cart",
  Transport: "car",
  Shopping: "shopping",
  Logement: "home",
  Abonnements: "wifi",
  "Sorties & Loisirs": "ticket-confirmation-outline",
  "Santé": "medical-bag",
  Épargne: "piggy-bank",
};

const categoryIcon = (name: string): IconName =>
  CATEGORY_ICON[name] ?? "tag-outline";

/** Nombre de catégories à surveiller affichées : on garde l'essentiel. */
const MAX_WATCHED = 3;

// ═══════════════════════════════════════════════════════════
//  SOUS-COMPOSANTS
// ═══════════════════════════════════════════════════════════

function ProgressBar({ ratio, color }: { ratio: number; color: string }) {
  const pct = Math.max(0, Math.min(ratio, 1)) * 100;
  return (
    <View style={bar.track}>
      <View style={[bar.fill, { backgroundColor: color, width: `${pct}%` }]} />
    </View>
  );
}

const bar = StyleSheet.create({
  track: {
    backgroundColor: `${colors.primary}1F`,
    borderRadius: 99,
    height: 8,
    overflow: "hidden",
  },
  fill: { borderRadius: 99, height: 8 },
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={stat.wrap}>
      <Text style={stat.label}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={stat.value}>
        {value}
      </Text>
    </View>
  );
}

const stat = StyleSheet.create({
  wrap: { flex: 1, gap: 2 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  value: { color: colors.text, fontSize: 15, fontWeight: "700" },
});

function QuickAction({
  icon,
  label,
  onPress,
  primary,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        action.btn,
        primary ? action.primary : action.secondary,
        pressed && { opacity: 0.85 },
      ]}
    >
      <MaterialCommunityIcons
        color={primary ? "#FFFFFF" : colors.primary}
        name={icon}
        size={20}
      />
      <Text style={[action.text, { color: primary ? "#FFFFFF" : colors.primary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const action = StyleSheet.create({
  btn: {
    alignItems: "center",
    borderRadius: 16,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 14,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primarySoft },
  text: { fontSize: 15, fontWeight: "700" },
});

function WatchRow({
  item,
  currency,
}: {
  item: CategoryAnalytics;
  currency: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push("/analyse")}
      style={({ pressed }) => [watch.row, pressed && { opacity: 0.8 }]}
    >
      <View
        style={[
          watch.icon,
          { backgroundColor: item.essential ? "#D3E4FE" : "#FFDAD6" },
        ]}
      >
        <MaterialCommunityIcons
          color={item.essential ? "#474552" : "#93000A"}
          name={categoryIcon(item.name)}
          size={18}
        />
      </View>
      <View style={watch.copy}>
        <Text numberOfLines={1} style={watch.name}>
          {item.name}
        </Text>
        <Text numberOfLines={1} style={watch.sub}>
          {formatMoney(item.current_amount, currency)} ce mois
        </Text>
      </View>
      <View style={watch.pill}>
        <Text style={watch.pillText}>{formatPct(item.variation_percentage)}</Text>
      </View>
    </Pressable>
  );
}

const watch = StyleSheet.create({
  row: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  icon: {
    alignItems: "center",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  copy: { flex: 1, gap: 1 },
  name: { color: colors.text, fontSize: 15, fontWeight: "600" },
  sub: { color: colors.textMuted, fontSize: 12 },
  pill: {
    backgroundColor: "#FFDAD6",
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: { color: "#93000A", fontSize: 12, fontWeight: "700" },
});

// ═══════════════════════════════════════════════════════════
//  ÉCRAN
// ═══════════════════════════════════════════════════════════

export default function DashboardScreen() {
  const userId = useAppStore((s) => s.userId);
  const currency = useAppStore((s) => s.currency);
  const period = useAppStore((s) => s.currentPeriod);
  const userName = useAppStore((s) => s.userName);

  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmSignOut = useCallback(() => {
    Alert.alert(
      userName ?? "Mon compte",
      "Vous resterez connecté jusqu'à ce que vous vous déconnectiez.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Se déconnecter",
          style: "destructive",
          onPress: () => void signOut(),
        },
      ],
    );
  }, [userName]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        if (!userId) throw new Error("no-session");
        setData(await analytics.dashboard(userId, period));
      } catch {
        if (!opts?.silent) {
          setData(null);
          setError(
            userId
              ? "Serveur injoignable. Vérifiez que le backend est démarré."
              : "Session non initialisée. Passez par l'onboarding.",
          );
        }
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [userId, period],
  );

  const onRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      await analytics.refresh(userId, period);
    } catch {
      // Rafraîchissement serveur indisponible : on repart des données actuelles.
    }
    await load({ silent: true });
    setRefreshing(false);
  }, [userId, period, load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading && !data) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error && !data) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.centered}>
          <MaterialCommunityIcons
            color={colors.textMuted}
            name="cloud-off-outline"
            size={40}
          />
          <Text style={styles.errorTitle}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const income = data?.income ?? 0;
  const expenses = data?.expenses ?? 0;
  const solde = data ? data.remaining_balance ?? income - expenses : 0;
  const spentRatio = income > 0 ? expenses / income : expenses > 0 ? 1 : 0;
  const barColor =
    spentRatio >= 1 ? colors.danger : spentRatio >= 0.85 ? colors.warning : colors.primary;
  const variation = data?.monthly_variation ?? null;

  const [year, month] = period.split("-").map(Number);
  const monthLabel = `${MONTHS_FR[month - 1] ?? ""} ${year}`;

  const watched = (data?.top_drift_categories ?? []).slice(0, MAX_WATCHED);
  const goal = data?.savings_goal ?? null;

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── En-tête ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.hello}>
              Bonjour{userName ? `, ${userName}` : ""}
            </Text>
            <Text style={styles.month}>{monthLabel}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mon compte"
            onPress={confirmSignOut}
            style={styles.avatar}
          >
            <MaterialCommunityIcons color="#FFFFFF" name="account" size={18} />
          </Pressable>
        </View>

        {/* ── Solde : la seule carte « héros » ── */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Solde restant</Text>
          <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(solde, currency)}
          </Text>

          {variation != null && (
            <Pressable
              hitSlop={10}
              onPress={() => router.push("/stats-detail")}
              style={styles.trend}
            >
              <MaterialCommunityIcons
                color={variation >= 0 ? colors.success : colors.danger}
                name={variation >= 0 ? "trending-up" : "trending-down"}
                size={16}
              />
              <Text style={styles.trendText}>
                {variation >= 0 ? "+" : "−"}
                {formatPct(variation).replace("+", "")} vs mois dernier
              </Text>
            </Pressable>
          )}

          <View style={styles.spentBlock}>
            <ProgressBar ratio={spentRatio} color={barColor} />
            <Text style={styles.spentText}>
              {Math.round(spentRatio * 100)} % des revenus dépensés
            </Text>
          </View>

          <View style={styles.stats}>
            <Stat label="Revenus" value={formatMoney(income, currency)} />
            <Stat label="Dépenses" value={formatMoney(expenses, currency)} />
            <Stat
              label="Épargne prévue"
              value={formatMoney(data?.savings ?? 0, currency)}
            />
          </View>
        </View>

        {/* ── Actions rapides ── */}
        <View style={styles.actions}>
          <QuickAction
            primary
            icon="plus"
            label="Dépense"
            onPress={() => router.push("/add-expense")}
          />
          <QuickAction
            icon="bank-plus"
            label="Revenu"
            onPress={() => router.push("/add-income")}
          />
        </View>

        {/* ── À surveiller ── */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>À surveiller</Text>
            {watched.length > 0 && (
              <Pressable hitSlop={10} onPress={() => router.push("/analyse")}>
                <Text style={styles.link}>Tout voir</Text>
              </Pressable>
            )}
          </View>
          {watched.length > 0 ? (
            watched.map((c) => (
              <WatchRow key={c.category_id} item={c} currency={currency} />
            ))
          ) : (
            <View style={styles.allGood}>
              <MaterialCommunityIcons
                color={colors.success}
                name="check-circle-outline"
                size={20}
              />
              <Text style={styles.allGoodText}>
                Rien d'inhabituel ce mois-ci.
              </Text>
            </View>
          )}
        </View>

        {/* ── Épargne ── */}
        {goal && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/savings")}
            style={({ pressed }) => [styles.savings, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.savingsTop}>
              <Text style={styles.savingsLabel}>Épargne</Text>
              <Text style={styles.savingsPct}>
                {Math.round(goal.progress_percentage * 100)} %
              </Text>
            </View>
            <ProgressBar ratio={goal.progress_percentage} color={colors.accent} />
            <Text style={styles.savingsText}>
              {formatMoney(goal.current_amount, currency)} sur{" "}
              {formatMoney(goal.target_amount, currency)}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scrollContent: { gap: 18, padding: 16, paddingBottom: 32 },

  centered: {
    alignItems: "center",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 99,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },

  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  hello: { color: colors.text, fontSize: 22, fontWeight: "700" },
  month: { color: colors.textMuted, fontSize: 13, fontWeight: "600", marginTop: 2 },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },

  hero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: 6,
    padding: 20,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  heroLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  heroAmount: {
    color: colors.primary,
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -1.5,
  },
  trend: { alignItems: "center", flexDirection: "row", gap: 4 },
  trendText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  spentBlock: { gap: 6, marginTop: 10 },
  spentText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  stats: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    paddingTop: 14,
  },

  actions: { flexDirection: "row", gap: 12 },

  section: { gap: 10 },
  sectionHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  link: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  allGood: {
    alignItems: "center",
    backgroundColor: colors.successSoft,
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  allGoodText: { color: colors.success, fontSize: 14, fontWeight: "600" },

  savings: {
    backgroundColor: "#EBDCFF",
    borderRadius: 20,
    gap: 10,
    padding: 16,
  },
  savingsTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  savingsLabel: { color: "#260059", fontSize: 15, fontWeight: "700" },
  savingsPct: { color: "#260059", fontSize: 15, fontWeight: "800" },
  savingsText: { color: "#572BA0", fontSize: 13, fontWeight: "600" },
});
