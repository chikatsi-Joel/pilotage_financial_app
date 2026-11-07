import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Polyline,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import { analytics as analyticsApi } from "../src/shared/api/analytics";
import { useAppStore } from "../src/shared/store";
import type { CategoryAnalytics, SavingsGoalSummary } from "../src/shared/types";
import { formatMoney } from "../src/shared/utils/money";
import { ProgressBar, ScreenHeader } from "../src/ui/components";
import { colors } from "../src/ui/theme";

// ═══════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════

type Period = "1M" | "3M" | "6M" | "1A";
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const PERIODS: { key: Period; label: string; months: number }[] = [
  { key: "1M", label: "1M", months: 1 },
  { key: "3M", label: "3M", months: 3 },
  { key: "6M", label: "6M", months: 6 },
  { key: "1A", label: "1A", months: 12 },
];

const MONTH_SHORT = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
  "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc",
];

const PALETTE = [
  colors.primary, "#6D43B7", colors.accent, "#E91E63",
  colors.success, colors.warning, "#0EA5E9", "#865DD2",
];

const ICON_RULES: readonly { match: RegExp; icon: IconName }[] = [
  { match: /alimentation|nourriture|courses|supermarch|restaurant|restauration/i, icon: "silverware-fork-knife" },
  { match: /transport|carburant|taxi|uber|bus|train|avion/i, icon: "car" },
  { match: /loisir|divertissement|vacance|abonnement|streaming|jeu/i, icon: "gamepad-variant" },
  { match: /sant|medical|pharmacie|soin/i, icon: "medical-bag" },
  { match: /maison|logement|loyer|electricite|eau|entretien/i, icon: "home" },
  { match: /v[eê]tement|shopping|habit|chaussure/i, icon: "shopping" },
  { match: /facture|energie|electricit|internet|telephone/i, icon: "receipt" },
  { match: /epargne|invest/i, icon: "piggy-bank-outline" },
];

function iconFor(label: string): IconName {
  for (const rule of ICON_RULES) {
    if (rule.match.test(label)) return rule.icon;
  }
  return "shape-outline";
}

type MonthPoint = {
  key: string;
  label: string;
  income: number;
  expenses: number;
  savings: number;
};

type CategorySlice = {
  categoryId: string;
  name: string;
  amount: number;
  pct: number;
  color: string;
  icon: IconName;
};

type Profile = {
  trend: number;
  volatility: number;
  drift: number;
  anomaly: number;
  seasonality: number;
  seasonalityReliable: boolean;
  confidence: number;
  changePoints: string[];
  forecastMethod: string;
  forecastValue: number;
  forecastMae: number | null;
};

type Insight = { icon: IconName; text: string; tone: "success" | "warning" };

// ═══════════════════════════════════════════════════════════
//  DÉRIVÉS DE L'API
// ═══════════════════════════════════════════════════════════

/** Les N derniers mois (inclus) jusqu'au mois courant de l'API. */
function monthWindow(period: string, months: number): string[] {
  const [y, m] = period.split("-").map(Number);
  const base = new Date(y || 1970, (m || 1) - 1, 1);
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function sliceCategories(items: CategoryAnalytics[]): CategorySlice[] {
  const total = items.reduce((acc, c) => acc + c.current_amount, 0);
  return items
    .filter((c) => c.current_amount > 0)
    .sort((a, b) => b.current_amount - a.current_amount)
    .map((c, i) => ({
      categoryId: c.category_id,
      name: c.name,
      amount: c.current_amount,
      pct: total > 0 ? Math.round((c.current_amount / total) * 100) : 0,
      color: PALETTE[i % PALETTE.length],
      icon: iconFor(c.name),
    }));
}

function averageProfile(items: CategoryAnalytics[]): Profile {
  const withHistory = items.filter((c) => c.baseline_amount > 0);
  const pool = withHistory.length ? withHistory : items;
  const n = pool.length || 1;
  const mean = (pick: (c: CategoryAnalytics) => number) =>
    pool.reduce((acc, c) => acc + (pick(c) || 0), 0) / n;

  const changePoints = Array.from(
    new Set(pool.flatMap((c) => c.profile.change_points.map((p) => p + 1))),
  )
    .sort((a, b) => a - b)
    .slice(0, 4)
    .map((m) => MONTH_SHORT[m - 1] ?? String(m));

  return {
    trend: mean((c) => c.profile.trend),
    volatility: mean((c) => c.profile.volatility),
    drift: mean((c) => c.profile.drift_score),
    anomaly: mean((c) => c.profile.anomaly_score),
    seasonality: mean((c) => c.profile.seasonality_strength),
    seasonalityReliable: pool.some((c) => c.profile.seasonality_reliable),
    confidence: mean((c) => c.profile.confidence),
    changePoints,
    forecastMethod: pool[0]?.profile.forecast.method ?? "n/a",
    forecastValue: mean((c) => c.profile.forecast.value),
    forecastMae: pool[0]?.profile.forecast.mae ?? null,
  };
}

function buildInsights(
  months: MonthPoint[],
  items: CategoryAnalytics[],
  goal: SavingsGoalSummary | null,
): Insight[] {
  const out: Insight[] = [];
  const current = months[months.length - 1];
  const previous = months[months.length - 2];

  if (current && previous && previous.expenses > 0) {
    const delta = ((current.expenses - previous.expenses) / previous.expenses) * 100;
    out.push({
      icon: delta <= 0 ? "trending-down" : "trending-up",
      tone: delta <= 0 ? "success" : "warning",
      text:
        `Vos dépenses ${delta <= 0 ? "diminuent" : "augmentent"} de ${Math.abs(
          Math.round(delta),
        )}% sur un mois`,
    });
  }

  for (const c of items) {
    if (c.profile.drift_score >= 0.5) {
      out.push({
        icon: "alert-circle-outline",
        tone: "warning",
        text: `${c.name} en dérive (${Math.round(c.variation_percentage)}% vs normale, confiance ${Math.round(
          c.profile.confidence * 100,
        )}%)`,
      });
      break;
    }
  }

  if (goal && goal.progress_percentage >= 90) {
    out.push({
      icon: "target",
      tone: "success",
      text: `Objectif « ${goal.name} » à ${Math.round(goal.progress_percentage)}%`,
    });
  }

  const potential = items.reduce((acc, c) => acc + c.potential_saving, 0);
  if (potential > 0) {
    out.push({
      icon: "piggy-bank-outline",
      tone: "success",
      text: `Potentiel d'économie identifié : ${formatMoney(potential)}`,
    });
  }

  return out;
}

// ═══════════════════════════════════════════════════════════
//  COMPOSANTS
// ═══════════════════════════════════════════════════════════

function PeriodTabs({ active, onChange }: { active: Period; onChange: (p: Period) => void }) {
  return (
    <View style={ptStyles.row}>
      {PERIODS.map((p) => {
        const isActive = active === p.key;
        return (
          <Pressable
            key={p.key}
            onPress={() => onChange(p.key)}
            style={[ptStyles.chip, isActive && ptStyles.chipActive]}
          >
            <Text style={[ptStyles.text, isActive && ptStyles.textActive]}>{p.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const ptStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6 },
  chip: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 },
  chipActive: { backgroundColor: colors.text },
  text: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  textActive: { color: "#FFFFFF" },
});

// ─────────────────────────────────────────────────────────
//  HERO — Solde + Métriques clés fusionnés
// ─────────────────────────────────────────────────────────

function HeroCard({
  balance,
  avgExpenses,
  avgSavings,
  savingsRate,
  variation,
  goal,
  burnRate,
  currency,
}: {
  balance: number;
  avgExpenses: number;
  avgSavings: number;
  savingsRate: number;
  variation: number | null;
  goal: SavingsGoalSummary | null;
  burnRate: number;
  currency: string;
}) {
  const days = 30;
  return (
    <View style={hStyles.card}>
      <View style={hStyles.top}>
        <Text style={hStyles.label}>{goal ? `Objectif : ${goal.name}` : "Solde du mois"}</Text>
        <Text style={hStyles.amount}>{formatMoney(balance, currency)}</Text>
        <View style={hStyles.trend}>
          <MaterialCommunityIcons
            color={variation != null && variation < 0 ? colors.success : colors.warning}
            name={variation != null && variation < 0 ? "trending-down" : "trending-up"}
            size={14}
          />
          <Text
            style={[
              hStyles.trendText,
              { color: variation != null && variation < 0 ? colors.success : colors.warning },
            ]}
          >
            {variation == null
              ? "Pas de comparaison"
              : `${variation > 0 ? "+" : ""}${Math.round(variation)}% vs mois précédent`}
          </Text>
        </View>
      </View>

      <View style={hStyles.divider} />

      <View style={hStyles.grid}>
        <HeroStat
          label="Dépenses moy."
          value={formatMoney(avgExpenses, currency)}
          delta={`${goal ? `${Math.round(goal.progress_percentage)}%` : "n/a"} objectif`}
          deltaUp
          muted
        />
        <HeroStat
          label="Épargne moy."
          value={formatMoney(avgSavings, currency)}
          delta={formatMoney(avgSavings, currency)}
          deltaUp
          muted
        />
        <HeroStat
          label="Taux épargne"
          value={`${Math.round(savingsRate * 100)}%`}
          delta="net"
          deltaUp
          muted
        />
      </View>

      <View style={hStyles.divider} />

      <View style={hStyles.burn}>
        <View style={hStyles.burnLeft}>
          <MaterialCommunityIcons color={colors.primary} name="fire" size={14} />
          <Text style={hStyles.burnLabel}>Burn rate</Text>
        </View>
        <Text style={hStyles.burnValue}>
          {formatMoney(burnRate, currency)}/jour
        </Text>
      </View>
      <ProgressBar
        progress={avgExpenses > 0 ? Math.min((burnRate * days) / avgExpenses, 1) * 100 : 0}
        height={4}
        color={colors.primary}
        trackColor="#F0F0F5"
        style={{ marginTop: 6 }}
      />
    </View>
  );
}

function HeroStat({
  label,
  value,
  delta,
  deltaUp,
  muted,
}: {
  label: string;
  value: string;
  delta: string;
  deltaUp?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={hsStyles.col}>
      <Text style={hsStyles.label}>{label}</Text>
      <Text style={hsStyles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text
        style={[
          hsStyles.delta,
          muted && hsStyles.deltaMuted,
          !muted && deltaUp && hsStyles.deltaUp,
          !muted && !deltaUp && hsStyles.deltaDown,
        ]}
      >
        {delta}
      </Text>
    </View>
  );
}

const hStyles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    gap: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
  },
  top: { gap: 2 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: "500" },
  amount: { color: colors.text, fontSize: 34, fontWeight: "700", letterSpacing: -1.5 },
  trend: { alignItems: "center", flexDirection: "row", gap: 4, marginTop: 4 },
  trendText: { color: colors.success, fontSize: 13, fontWeight: "600" },
  divider: { backgroundColor: "#F0F0F5", height: 1 },
  grid: { flexDirection: "row", gap: 8 },
  burn: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  burnLeft: { alignItems: "center", flexDirection: "row", gap: 6 },
  burnLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "500" },
  burnValue: { color: colors.text, fontSize: 13, fontWeight: "700" },
});

const hsStyles = StyleSheet.create({
  col: { flex: 1, gap: 2 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: "500" },
  value: { color: colors.text, fontSize: 15, fontWeight: "700" },
  delta: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  deltaUp: { color: colors.success },
  deltaDown: { color: "#E91E63" },
  deltaMuted: { color: colors.textMuted },
});

// ─────────────────────────────────────────────────────────
//  AREA CHART
// ─────────────────────────────────────────────────────────

function AreaChart({ months, currency }: { months: MonthPoint[]; currency: string }) {
  const W = 340;
  const H = 180;
  const PAD_L = 46;
  const PAD_B = 24;
  const chartH = H - PAD_B;

  const income = months.map((m) => m.income);
  const expenses = months.map((m) => m.expenses);
  const max = Math.max(1, ...income, ...expenses) * 1.1;
  const stepX = months.length > 1 ? (W - PAD_L) / (months.length - 1) : 0;

  const toY = (v: number) => chartH - (v / max) * chartH;
  const toX = (i: number) => PAD_L + i * stepX;

  const { incArea, expArea, incPoints, expPoints } = useMemo(() => {
    const incPath = income.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(v)}`).join(" ");
    const expPath = expenses.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(v)}`).join(" ");
    return {
      incArea: `${incPath} L${toX(income.length - 1)},${chartH} L${toX(0)},${chartH} Z`,
      expArea: `${expPath} L${toX(expenses.length - 1)},${chartH} L${toX(0)},${chartH} Z`,
      incPoints: income.map((v, i) => `${toX(i)},${toY(v)}`).join(" "),
      expPoints: expenses.map((v, i) => `${toX(i)},${toY(v)}`).join(" "),
    };
  }, [months]);

  return (
    <View style={acStyles.wrap}>
      <View style={acStyles.header}>
        <Text style={acStyles.title}>Revenus vs Dépenses</Text>
        <View style={acStyles.legend}>
          <View style={acStyles.dotWrap}>
            <View style={[acStyles.dot, { backgroundColor: colors.primary }]} />
            <Text style={acStyles.dotLabel}>Revenus</Text>
          </View>
          <View style={acStyles.dotWrap}>
            <View style={[acStyles.dot, { backgroundColor: "#E91E63" }]} />
            <Text style={acStyles.dotLabel}>Dépenses</Text>
          </View>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={W + 16} height={H + 8}>
          <Defs>
            <LinearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} stopOpacity="0.25" />
              <Stop offset="1" stopColor={colors.primary} stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#E91E63" stopOpacity="0.18" />
              <Stop offset="1" stopColor="#E91E63" stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {[0, 0.33, 0.66, 1].map((pct) => (
            <Line
              key={pct}
              x1={PAD_L}
              y1={chartH * (1 - pct)}
              x2={W}
              y2={chartH * (1 - pct)}
              stroke="#F0F0F5"
              strokeWidth={1}
            />
          ))}

          {[0, 0.5, 1].map((pct) => (
            <SvgText
              key={pct}
              x={PAD_L - 8}
              y={chartH * (1 - pct) + 4}
              fontSize={10}
              fill={colors.textMuted}
              textAnchor="end"
            >
              {formatMoney(max * pct, currency)}
            </SvgText>
          ))}

          <Path d={incArea} fill="url(#incGrad)" />
          <Path d={expArea} fill="url(#expGrad)" />

          <Polyline points={incPoints} fill="none" stroke={colors.primary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          <Polyline points={expPoints} fill="none" stroke="#E91E63" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

          {income.map((v, i) => (
            <Circle key={`i${i}`} cx={toX(i)} cy={toY(v)} r={3.5} fill="#FFFFFF" stroke={colors.primary} strokeWidth={2} />
          ))}
          {expenses.map((v, i) => (
            <Circle key={`e${i}`} cx={toX(i)} cy={toY(v)} r={3.5} fill="#FFFFFF" stroke="#E91E63" strokeWidth={2} />
          ))}

          {months.map((m, i) => (
            <SvgText key={m.key} x={toX(i)} y={H} fontSize={11} fill={colors.textMuted} textAnchor="middle" fontWeight="600">
              {m.label}
            </SvgText>
          ))}
        </Svg>
      </ScrollView>
    </View>
  );
}

const acStyles = StyleSheet.create({
  wrap: { gap: 12 },
  header: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 },
  title: { color: colors.text, fontSize: 17, fontWeight: "700" },
  legend: { flexDirection: "row", gap: 12 },
  dotWrap: { alignItems: "center", flexDirection: "row", gap: 5 },
  dot: { borderRadius: 99, height: 7, width: 7 },
  dotLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "500" },
});

// ─────────────────────────────────────────────────────────
//  PROFIL STATISTIQUE
// ─────────────────────────────────────────────────────────

function ProfileCard({ profile }: { profile: Profile }) {
  const pct = (v: number) => `${Math.round(Math.min(Math.max(v, 0), 1) * 100)}%`;
  return (
    <View style={pfStyles.card}>
      <Text style={pfStyles.title}>Profil statistique</Text>

      <View style={pfStyles.metrics}>
        <ProfileMetric icon="trending-up" color={colors.success} label="Tendance" value={profile.trend.toFixed(2)} />
        <ProfileMetric icon="waveform" color={colors.accent} label="Volatilité" value={profile.volatility.toFixed(2)} />
        <ProfileMetric icon="chart-bubble" color={colors.warning} label="Drift" value={profile.drift.toFixed(2)} />
        <ProfileMetric icon="alert-circle" color={colors.danger} label="Anomalies" value={profile.anomaly.toFixed(2)} />
      </View>

      <View style={pfStyles.bars}>
        <ProfileBar
          icon="calendar-sync"
          color={colors.primary}
          label="Saisonnalité"
          value={pct(profile.seasonality)}
          width={pct(profile.seasonality) as DimensionValue}
        />
        <ProfileBar
          icon="shield-check"
          color={colors.accent}
          label="Confiance"
          value={pct(profile.confidence)}
          width={pct(profile.confidence) as DimensionValue}
        />
      </View>

      <View style={pfStyles.footer}>
        <MaterialCommunityIcons color={colors.textMuted} name="flag-outline" size={14} />
        <Text style={pfStyles.footerText}>
          {profile.seasonalityReliable ? "Saisonnalité fiable · " : ""}Changements détectés :
        </Text>
        <View style={pfStyles.chips}>
          {profile.changePoints.length === 0 ? (
            <Text style={pfStyles.chip}>Aucun</Text>
          ) : (
            profile.changePoints.map((m) => (
              <Text key={m} style={pfStyles.chip}>{m}</Text>
            ))
          )}
        </View>
      </View>
    </View>
  );
}

function ProfileMetric({ icon, color, label, value }: { icon: IconName; color: string; label: string; value: string }) {
  return (
    <View style={pmStyles.col}>
      <View style={[pmStyles.icon, { backgroundColor: `${color}12` }]}>
        <MaterialCommunityIcons color={color} name={icon} size={16} />
      </View>
      <Text style={pmStyles.value}>{value}</Text>
      <Text style={pmStyles.label}>{label}</Text>
    </View>
  );
}

function ProfileBar({ icon, color, label, value, width }: { icon: IconName; color: string; label: string; value: string; width: DimensionValue }) {
  return (
    <View style={pbStyles.row}>
      <View style={pbStyles.left}>
        <MaterialCommunityIcons color={color} name={icon} size={14} />
        <Text style={pbStyles.label}>{label}</Text>
      </View>
      <View style={pbStyles.right}>
        <View style={pbStyles.track}>
          <View style={[pbStyles.fill, { width, backgroundColor: color }]} />
        </View>
        <Text style={pbStyles.value}>{value}</Text>
      </View>
    </View>
  );
}

const pfStyles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    gap: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: "700" },
  metrics: { flexDirection: "row", justifyContent: "space-between" },
  bars: { gap: 12 },
  footer: { alignItems: "center", flexDirection: "row", gap: 8 },
  footerText: { color: colors.textMuted, fontSize: 12, fontWeight: "500" },
  chips: { flexDirection: "row", gap: 6 },
  chip: {
    backgroundColor: `${colors.danger}10`,
    borderRadius: 6,
    color: colors.danger,
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});

const pmStyles = StyleSheet.create({
  col: { alignItems: "center", gap: 6 },
  icon: { alignItems: "center", borderRadius: 10, height: 32, justifyContent: "center", width: 32 },
  value: { color: colors.text, fontSize: 16, fontWeight: "700" },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: "500" },
});

const pbStyles = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  left: { alignItems: "center", flexDirection: "row", gap: 8 },
  label: { color: colors.text, fontSize: 13, fontWeight: "500" },
  right: { alignItems: "center", flexDirection: "row", gap: 10 },
  track: { backgroundColor: "#F0F0F5", borderRadius: 99, height: 5, width: 80 },
  fill: { borderRadius: 99, height: 5 },
  value: { color: colors.text, fontSize: 13, fontWeight: "700", minWidth: 32, textAlign: "right" },
});

// ─────────────────────────────────────────────────────────
//  PRÉVISION
// ─────────────────────────────────────────────────────────

function ForecastCard({
  profile,
  nextLabel,
  currency,
}: {
  profile: Profile;
  nextLabel: string;
  currency: string;
}) {
  const maePct =
    profile.forecastValue > 0 && profile.forecastMae != null
      ? Math.abs(profile.forecastMae / profile.forecastValue) * 100
      : null;
  return (
    <View style={fcStyles.card}>
      <View style={fcStyles.header}>
        <View style={fcStyles.icon}>
          <MaterialCommunityIcons color={colors.primary} name="crystal-ball" size={20} />
        </View>
        <View>
          <Text style={fcStyles.title}>Prévision {nextLabel}</Text>
          <Text style={fcStyles.sub}>
            Méthode {profile.forecastMethod}
            {maePct != null ? ` — erreur ${maePct.toFixed(1)}%` : ""}
          </Text>
        </View>
      </View>

      <View style={fcStyles.body}>
        <View style={fcStyles.col}>
          <Text style={fcStyles.label}>Dépense prédite</Text>
          <Text style={fcStyles.amount}>{formatMoney(profile.forecastValue, currency)}</Text>
          <Text style={fcStyles.delta}>Moyenne des catégories</Text>
        </View>
        <View style={fcStyles.sep} />
        <View style={fcStyles.col}>
          <Text style={fcStyles.label}>Marge d'erreur</Text>
          <Text style={[fcStyles.amount, { color: colors.accent }]}>
            {profile.forecastMae == null ? "—" : `± ${formatMoney(profile.forecastMae, currency)}`}
          </Text>
          <Text style={fcStyles.delta}>MAE du modèle</Text>
        </View>
      </View>
    </View>
  );
}

const fcStyles = StyleSheet.create({
  card: {
    backgroundColor: "#F8F9FF",
    borderColor: "#E4E6F0",
    borderRadius: 24,
    borderWidth: 1,
    gap: 16,
    padding: 20,
  },
  header: { alignItems: "center", flexDirection: "row", gap: 12 },
  icon: {
    alignItems: "center",
    backgroundColor: `${colors.primary}12`,
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: 12, fontWeight: "500", marginTop: 2 },
  body: { flexDirection: "row", gap: 16 },
  col: { flex: 1, gap: 4 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "500" },
  amount: { color: colors.text, fontSize: 20, fontWeight: "700" },
  delta: { color: colors.success, fontSize: 12, fontWeight: "600" },
  sep: { backgroundColor: "#E4E6F0", width: 1 },
});

// ─────────────────────────────────────────────────────────
//  DONUT
// ─────────────────────────────────────────────────────────

function DonutChart({
  categories,
  total,
  periodLabel,
  currency,
}: {
  categories: CategorySlice[];
  total: number;
  periodLabel: string;
  currency: string;
}) {
  const size = 130;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  const segments = useMemo(() => {
    let acc = 0;
    return categories.map((cat) => {
      const dash = (cat.pct / 100) * circ;
      const offset = -(acc / 100) * circ;
      acc += cat.pct;
      return { ...cat, dash, offset };
    });
  }, [categories]);

  return (
    <View style={dnStyles.card}>
      <View style={dnStyles.header}>
        <Text style={dnStyles.title}>Répartition</Text>
        <Text style={dnStyles.sub}>{periodLabel}</Text>
      </View>

      <View style={dnStyles.body}>
        <View style={dnStyles.wrap}>
          <Svg width={size} height={size}>
            {segments.map((seg) => (
              <Circle
                key={seg.categoryId}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(seg.dash - 2, 0)} ${circ - seg.dash + 2}`}
                strokeDashoffset={seg.offset}
                strokeLinecap="round"
              />
            ))}
          </Svg>
          <View style={dnStyles.center}>
            <Text style={dnStyles.total} numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(total, currency)}
            </Text>
          </View>
        </View>

        <View style={dnStyles.legend}>
          {categories.map((cat) => (
            <View key={cat.categoryId} style={dnStyles.row}>
              <View style={[dnStyles.dot, { backgroundColor: cat.color }]} />
              <Text style={dnStyles.name}>{cat.name}</Text>
              <Text style={dnStyles.pct}>{cat.pct}%</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const dnStyles = StyleSheet.create({
  card: { gap: 16 },
  header: { paddingHorizontal: 4 },
  title: { color: colors.text, fontSize: 17, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: 12, fontWeight: "500", marginTop: 2 },
  body: { alignItems: "center", flexDirection: "row", gap: 24 },
  wrap: { alignItems: "center", justifyContent: "center" },
  center: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  total: { color: colors.text, fontSize: 18, fontWeight: "700" },
  legend: { flex: 1, gap: 10 },
  row: { alignItems: "center", flexDirection: "row", gap: 8 },
  dot: { borderRadius: 99, height: 8, width: 8 },
  name: { color: colors.text, flex: 1, fontSize: 13, fontWeight: "500" },
  pct: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
});

// ─────────────────────────────────────────────────────────
//  CATÉGORIES
// ─────────────────────────────────────────────────────────

function CategoryBars({
  categories,
  currency,
}: {
  categories: CategorySlice[];
  currency: string;
}) {
  const maxAmt = Math.max(1, ...categories.map((c) => c.amount));

  return (
    <View style={cbStyles.wrap}>
      <Text style={cbStyles.title}>Détail par catégorie</Text>
      {categories.length === 0 ? (
        <Text style={cbStyles.empty}>Aucune dépense enregistrée sur la période.</Text>
      ) : (
        categories.map((cat) => (
          <View key={cat.categoryId} style={cbStyles.row}>
            <View style={cbStyles.top}>
              <View style={cbStyles.left}>
                <View style={[cbStyles.icon, { backgroundColor: `${cat.color}12` }]}>
                  <MaterialCommunityIcons color={cat.color} name={cat.icon} size={15} />
                </View>
                <Text style={cbStyles.name}>{cat.name}</Text>
              </View>
              <Text style={cbStyles.amount}>{formatMoney(cat.amount, currency)}</Text>
            </View>
            <View style={cbStyles.track}>
              <View
                style={[
                  cbStyles.fill,
                  { width: `${(cat.amount / maxAmt) * 100}%`, backgroundColor: cat.color },
                ]}
              />
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const cbStyles = StyleSheet.create({
  wrap: { gap: 14 },
  title: { color: colors.text, fontSize: 17, fontWeight: "700", paddingHorizontal: 4 },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: "italic", paddingHorizontal: 4 },
  row: { gap: 8 },
  top: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  left: { alignItems: "center", flexDirection: "row", gap: 10 },
  icon: { alignItems: "center", borderRadius: 8, height: 28, justifyContent: "center", width: 28 },
  name: { color: colors.text, fontSize: 14, fontWeight: "500" },
  amount: { color: colors.text, fontSize: 14, fontWeight: "700" },
  track: { backgroundColor: "#F0F0F5", borderRadius: 99, height: 8, overflow: "hidden" },
  fill: { borderRadius: 99, height: "100%" },
});

// ─────────────────────────────────────────────────────────
//  INSIGHTS
// ─────────────────────────────────────────────────────────

function InsightAlerts({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <View style={inStyles.wrap}>
      <Text style={inStyles.title}>Alertes</Text>
      {insights.map((ins, i) => (
        <View
          key={i}
          style={[
            inStyles.row,
            { borderLeftColor: ins.tone === "success" ? colors.success : colors.warning },
          ]}
        >
          <MaterialCommunityIcons
            color={ins.tone === "success" ? colors.success : colors.warning}
            name={ins.icon}
            size={18}
          />
          <Text style={inStyles.text}>{ins.text}</Text>
        </View>
      ))}
    </View>
  );
}

const inStyles = StyleSheet.create({
  wrap: { gap: 10 },
  title: { color: colors.text, fontSize: 17, fontWeight: "700", paddingHorizontal: 4 },
  row: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderLeftWidth: 3,
    borderRadius: 12,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
  },
  text: { color: colors.text, flex: 1, fontSize: 13, fontWeight: "500", lineHeight: 18 },
});

// ═══════════════════════════════════════════════════════════
//  ÉCRAN PRINCIPAL
// ═══════════════════════════════════════════════════════════

export default function StatsDetail() {
  const userId = useAppStore((s) => s.userId);
  const period = useAppStore((s) => s.currentPeriod);
  const currency = useAppStore((s) => s.currency);

  const [range, setRange] = useState<Period>("3M");
  const [months, setMonths] = useState<MonthPoint[]>([]);
  const [items, setItems] = useState<CategoryAnalytics[]>([]);
  const [goal, setGoal] = useState<SavingsGoalSummary | null>(null);
  const [balance, setBalance] = useState(0);
  const [savingsRate, setSavingsRate] = useState(0);
  const [variation, setVariation] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setError(null);
    const window = monthWindow(period, PERIODS.find((p) => p.key === range)!.months);
    try {
      const [dashboards, catItems] = await Promise.all([
        Promise.all(
          window.map((m) => analyticsApi.dashboard(userId, m).catch(() => null)),
        ),
        analyticsApi.categories(userId, period).catch(() => [] as CategoryAnalytics[]),
      ]);

      setMonths(
        window.map((key, i) => {
          const [y, m] = key.split("-").map(Number);
          const d = dashboards[i];
          return {
            key,
            label: MONTH_SHORT[m - 1] ?? key,
            income: d?.income ?? 0,
            expenses: d?.expenses ?? 0,
            savings: d?.savings ?? 0,
          };
        }),
      );
      setItems(catItems);

      const current = dashboards[dashboards.length - 1];
      setBalance(current?.savings ?? 0);
      setSavingsRate(current?.savings_rate ?? 0);
      setGoal(current?.savings_goal ?? null);
      const previous = dashboards[dashboards.length - 2];
      setVariation(
        current && previous && previous.expenses > 0
          ? ((current.expenses - previous.expenses) / previous.expenses) * 100
          : (current?.monthly_variation ?? null),
      );
    } catch {
      setError("Statistiques indisponibles. Vérifiez la connexion au serveur.");
    } finally {
      setLoading(false);
    }
  }, [userId, period, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const slices = useMemo(() => sliceCategories(items), [items]);
  const profile = useMemo(() => averageProfile(items), [items]);
  const insights = useMemo(() => buildInsights(months, items, goal), [months, items, goal]);

  const totalExpenses = slices.reduce((acc, c) => acc + c.amount, 0);
  const avgExpenses =
    months.length > 0 ? months.reduce((acc, m) => acc + m.expenses, 0) / months.length : 0;
  const avgSavings =
    months.length > 0 ? months.reduce((acc, m) => acc + m.savings, 0) / months.length : 0;
  const burnRate = avgExpenses / 30;

  const nextMonth = (() => {
    const [y, m] = period.split("-").map(Number);
    const d = new Date(y || 1970, (m || 1), 1);
    return MONTH_SHORT[d.getMonth()] ?? "mois suivant";
  })();

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScreenHeader title="Statistiques" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={undefined}
      >
        <PeriodTabs active={range} onChange={setRange} />

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <>
            <HeroCard
              balance={balance}
              avgExpenses={avgExpenses}
              avgSavings={avgSavings}
              savingsRate={savingsRate}
              variation={variation}
              goal={goal}
              burnRate={burnRate}
              currency={currency}
            />
            <AreaChart months={months} currency={currency} />
            <ProfileCard profile={profile} />
            <ForecastCard profile={profile} nextLabel={nextMonth} currency={currency} />
            <DonutChart
              categories={slices}
              total={totalExpenses}
              periodLabel={period}
              currency={currency}
            />
            <CategoryBars categories={slices} currency={currency} />
            <InsightAlerts insights={insights} />
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scroll: { gap: 24, padding: 16, paddingBottom: 32 },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    paddingVertical: 24,
    textAlign: "center",
  },
});
