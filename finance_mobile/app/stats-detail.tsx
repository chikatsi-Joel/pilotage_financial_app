import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
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

import { colors } from "../src/ui/theme";

// ═══════════════════════════════════════════════════════════
//  TYPES & DONNÉES
// ═══════════════════════════════════════════════════════════

type Period = "1M" | "3M" | "6M" | "1A";
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const PERIODS: { key: Period; label: string }[] = [
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "6M", label: "6M" },
  { key: "1A", label: "1A" },
];

const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû"];
const INCOME = [3200, 3200, 3200, 3200, 3200, 3200, 3200, 3200];
const EXPENSES = [2400, 2100, 2600, 2300, 2500, 2200, 2100, 1950];
const SAVINGS = INCOME.map((inc, i) => inc - EXPENSES[i]);

const CATEGORIES = [
  { name: "Logement", pct: 35, amount: 850, color: colors.primary, icon: "home" as IconName },
  { name: "Alimentation", pct: 22, amount: 530, color: "#6D43B7", icon: "food" as IconName },
  { name: "Transport", pct: 15, amount: 360, color: colors.accent, icon: "car" as IconName },
  { name: "Loisirs", pct: 14, amount: 340, color: "#E91E63", icon: "gamepad-variant" as IconName },
  { name: "Santé", pct: 8, amount: 195, color: colors.success, icon: "medical-bag" as IconName },
  { name: "Autres", pct: 6, amount: 145, color: colors.textMuted, icon: "dots-horizontal" as IconName },
];

const INSIGHTS = [
  { icon: "trending-down" as IconName, text: "Vos dépenses diminuent de 8% sur 3 mois", tone: "success" as const },
  { icon: "alert-circle-outline" as IconName, text: "Budget loisirs dépassé de 15%", tone: "warning" as const },
  { icon: "target" as IconName, text: "Objectif épargne atteint à 90%", tone: "success" as const },
];

const fmt = (v: number) => new Intl.NumberFormat("fr-FR").format(v);

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

function HeroCard() {
  const avgExpense = Math.round(EXPENSES.reduce((a, b) => a + b, 0) / EXPENSES.length);
  const avgSaving = Math.round(SAVINGS.reduce((a, b) => a + b, 0) / SAVINGS.length);
  const burnRate = Math.round(avgExpense / 30);

  return (
    <View style={hStyles.card}>
      <View style={hStyles.top}>
        <Text style={hStyles.label}>Solde actuel</Text>
        <Text style={hStyles.amount}>2 450 €</Text>
        <View style={hStyles.trend}>
          <MaterialCommunityIcons color={colors.success} name="trending-up" size={14} />
          <Text style={hStyles.trendText}>+12% vs juillet</Text>
        </View>
      </View>

      <View style={hStyles.divider} />

      <View style={hStyles.grid}>
        <HeroStat label="Dépenses moy." value={`${fmt(avgExpense)} €`} delta="-8%" deltaUp={false} />
        <HeroStat label="Épargne moy." value={`${fmt(avgSaving)} €`} delta="+12%" deltaUp />
        <HeroStat label="Taux épargne" value="27%" delta="obj. 30%" deltaUp={false} muted />
      </View>

      <View style={hStyles.divider} />

      <View style={hStyles.burn}>
        <View style={hStyles.burnLeft}>
          <MaterialCommunityIcons color={colors.primary} name="fire" size={14} />
          <Text style={hStyles.burnLabel}>Burn rate</Text>
        </View>
        <Text style={hStyles.burnValue}>{fmt(burnRate)} €/jour</Text>
      </View>
      <View style={hStyles.burnBar}>
        <View style={[hStyles.burnFill, { width: `${Math.min((burnRate / 150) * 100, 100)}%` }]} />
      </View>
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
      <Text style={hsStyles.value}>{value}</Text>
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
  amount: { color: colors.text, fontSize: 40, fontWeight: "700", letterSpacing: -1.5 },
  trend: { alignItems: "center", flexDirection: "row", gap: 4, marginTop: 4 },
  trendText: { color: colors.success, fontSize: 13, fontWeight: "600" },
  divider: { backgroundColor: "#F0F0F5", height: 1 },
  grid: { flexDirection: "row", gap: 8 },
  burn: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  burnLeft: { alignItems: "center", flexDirection: "row", gap: 6 },
  burnLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "500" },
  burnValue: { color: colors.text, fontSize: 13, fontWeight: "700" },
  burnBar: { backgroundColor: "#F0F0F5", borderRadius: 99, height: 4, marginTop: 6 },
  burnFill: { backgroundColor: colors.primary, borderRadius: 99, height: 4 },
});

const hsStyles = StyleSheet.create({
  col: { flex: 1, gap: 2 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: "500" },
  value: { color: colors.text, fontSize: 16, fontWeight: "700" },
  delta: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  deltaUp: { color: colors.success },
  deltaDown: { color: "#E91E63" },
  deltaMuted: { color: colors.textMuted },
});

// ─────────────────────────────────────────────────────────
//  AREA CHART
// ─────────────────────────────────────────────────────────

function AreaChart() {
  const W = 340;
  const H = 180;
  const PAD_L = 40;
  const PAD_B = 24;
  const chartH = H - PAD_B;
  const max = Math.max(...INCOME) * 1.1;
  const stepX = (W - PAD_L) / (MONTHS.length - 1);

  const toY = (v: number) => chartH - (v / max) * chartH;
  const toX = (i: number) => PAD_L + i * stepX;

  const { incArea, expArea, incPoints, expPoints } = useMemo(() => {
    const incPath = INCOME.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(v)}`).join(" ");
    const expPath = EXPENSES.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(v)}`).join(" ");
    return {
      incArea: `${incPath} L${toX(INCOME.length - 1)},${chartH} L${toX(0)},${chartH} Z`,
      expArea: `${expPath} L${toX(EXPENSES.length - 1)},${chartH} L${toX(0)},${chartH} Z`,
      incPoints: INCOME.map((v, i) => `${toX(i)},${toY(v)}`).join(" "),
      expPoints: EXPENSES.map((v, i) => `${toX(i)},${toY(v)}`).join(" "),
    };
  }, []);

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
              {`${Math.round((max * pct) / 1000)}k`}
            </SvgText>
          ))}

          <Path d={incArea} fill="url(#incGrad)" />
          <Path d={expArea} fill="url(#expGrad)" />

          <Polyline points={incPoints} fill="none" stroke={colors.primary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          <Polyline points={expPoints} fill="none" stroke="#E91E63" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

          {INCOME.map((v, i) => (
            <Circle key={`i${i}`} cx={toX(i)} cy={toY(v)} r={3.5} fill="#FFFFFF" stroke={colors.primary} strokeWidth={2} />
          ))}
          {EXPENSES.map((v, i) => (
            <Circle key={`e${i}`} cx={toX(i)} cy={toY(v)} r={3.5} fill="#FFFFFF" stroke="#E91E63" strokeWidth={2} />
          ))}

          {MONTHS.map((m, i) => (
            <SvgText key={m} x={toX(i)} y={H} fontSize={11} fill={colors.textMuted} textAnchor="middle" fontWeight="600">
              {m}
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
//  PROFIL STATISTIQUE — redesigné en ligne propre
// ─────────────────────────────────────────────────────────

function ProfileCard() {
  return (
    <View style={pfStyles.card}>
      <Text style={pfStyles.title}>Profil statistique</Text>

      <View style={pfStyles.metrics}>
        <ProfileMetric icon="trending-up" color={colors.success} label="Tendance" value="+2.4%" />
        <ProfileMetric icon="waveform" color={colors.accent} label="Volatilité" value="0.18" />
        <ProfileMetric icon="chart-bubble" color={colors.warning} label="Drift" value="0.35" />
        <ProfileMetric icon="alert-circle" color={colors.danger} label="Anomalies" value="0.12" />
      </View>

      <View style={pfStyles.bars}>
        <ProfileBar icon="calendar-sync" color={colors.primary} label="Saisonnalité" value="0.68" width="68%" />
        <ProfileBar icon="shield-check" color={colors.accent} label="Confiance" value="82%" width="82%" />
      </View>

      <View style={pfStyles.footer}>
        <MaterialCommunityIcons color={colors.textMuted} name="flag-outline" size={14} />
        <Text style={pfStyles.footerText}>Changements détectés :</Text>
        <View style={pfStyles.chips}>
          <Text style={pfStyles.chip}>Mars</Text>
          <Text style={pfStyles.chip}>Juin</Text>
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

function ForecastCard() {
  return (
    <View style={fcStyles.card}>
      <View style={fcStyles.header}>
        <View style={fcStyles.icon}>
          <MaterialCommunityIcons color={colors.primary} name="crystal-ball" size={20} />
        </View>
        <View>
          <Text style={fcStyles.title}>Prévision septembre</Text>
          <Text style={fcStyles.sub}>Méthode EWMA — erreur 5.8%</Text>
        </View>
      </View>

      <View style={fcStyles.body}>
        <View style={fcStyles.col}>
          <Text style={fcStyles.label}>Dépense prédite</Text>
          <Text style={fcStyles.amount}>1 870 €</Text>
          <Text style={fcStyles.delta}>-4% vs août</Text>
        </View>
        <View style={fcStyles.sep} />
        <View style={fcStyles.col}>
          <Text style={fcStyles.label}>Marge d'erreur</Text>
          <Text style={[fcStyles.amount, { color: colors.accent }]}>± 145 €</Text>
          <Text style={fcStyles.delta}>MAE : 145 €</Text>
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
  amount: { color: colors.text, fontSize: 24, fontWeight: "700" },
  delta: { color: colors.success, fontSize: 12, fontWeight: "600" },
  sep: { backgroundColor: "#E4E6F0", width: 1 },
});

// ─────────────────────────────────────────────────────────
//  DONUT
// ─────────────────────────────────────────────────────────

function DonutChart() {
  const size = 130;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  const segments = useMemo(() => {
    let acc = 0;
    return CATEGORIES.map((cat) => {
      const dash = (cat.pct / 100) * circ;
      const offset = -(acc / 100) * circ;
      acc += cat.pct;
      return { ...cat, dash, offset };
    });
  }, []);

  return (
    <View style={dnStyles.card}>
      <View style={dnStyles.header}>
        <Text style={dnStyles.title}>Répartition</Text>
        <Text style={dnStyles.sub}>Août 2026</Text>
      </View>

      <View style={dnStyles.body}>
        <View style={dnStyles.wrap}>
          <Svg width={size} height={size}>
            {segments.map((seg) => (
              <Circle
                key={seg.name}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={stroke}
                strokeDasharray={`${seg.dash - 2} ${circ - seg.dash + 2}`}
                strokeDashoffset={seg.offset}
                strokeLinecap="round"
              />
            ))}
          </Svg>
          <View style={dnStyles.center}>
            <Text style={dnStyles.total}>{fmt(EXPENSES[7])}</Text>
            <Text style={dnStyles.unit}>€</Text>
          </View>
        </View>

        <View style={dnStyles.legend}>
          {CATEGORIES.map((cat) => (
            <View key={cat.name} style={dnStyles.row}>
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
  total: { color: colors.text, fontSize: 22, fontWeight: "700" },
  unit: { color: colors.textMuted, fontSize: 12, fontWeight: "500" },
  legend: { flex: 1, gap: 10 },
  row: { alignItems: "center", flexDirection: "row", gap: 8 },
  dot: { borderRadius: 99, height: 8, width: 8 },
  name: { color: colors.text, flex: 1, fontSize: 13, fontWeight: "500" },
  pct: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
});

// ─────────────────────────────────────────────────────────
//  CATÉGORIES — barres épaisses et design
// ─────────────────────────────────────────────────────────

function CategoryBars() {
  const maxAmt = Math.max(...CATEGORIES.map((c) => c.amount));

  return (
    <View style={cbStyles.wrap}>
      <Text style={cbStyles.title}>Détail par catégorie</Text>
      {CATEGORIES.map((cat) => (
        <View key={cat.name} style={cbStyles.row}>
          <View style={cbStyles.top}>
            <View style={cbStyles.left}>
              <View style={[cbStyles.icon, { backgroundColor: `${cat.color}12` }]}>
                <MaterialCommunityIcons color={cat.color} name={cat.icon} size={15} />
              </View>
              <Text style={cbStyles.name}>{cat.name}</Text>
            </View>
            <Text style={cbStyles.amount}>{fmt(cat.amount)} €</Text>
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
      ))}
    </View>
  );
}

const cbStyles = StyleSheet.create({
  wrap: { gap: 14 },
  title: { color: colors.text, fontSize: 17, fontWeight: "700", paddingHorizontal: 4 },
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
//  INSIGHTS — bordures latérales, pas de fonds criards
// ─────────────────────────────────────────────────────────

function InsightAlerts() {
  return (
    <View style={inStyles.wrap}>
      <Text style={inStyles.title}>Alertes</Text>
      {INSIGHTS.map((ins, i) => (
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
  const [period, setPeriod] = useState<Period>("1M");

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons color={colors.text} name="arrow-left" size={22} />
        </Pressable>
        <Text style={styles.headerTitle}>Statistiques</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <PeriodTabs active={period} onChange={setPeriod} />
        <HeroCard />
        <AreaChart />
        <ProfileCard />
        <ForecastCard />
        <DonutChart />
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

  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { padding: 6 },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: "600" },
});