import { useCallback, useState } from "react";
import {
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
import { Link, router, useFocusEffect } from "expo-router";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";

import { colors, interFonts } from "../../src/ui/theme";
import { ProfileMenu } from "../../src/ui/ProfileMenu";
import { analytics } from "../../src/shared/api/analytics";
import { useAppStore } from "../../src/shared/store";
import { signOut } from "../../src/shared/auth/signOut";
import type {
  CategoryAnalytics,
  Dashboard,
  WeeklyExpense,
} from "../../src/shared/types";
import { formatMoney } from "../../src/shared/utils/money";
import { formatPct } from "../../src/shared/utils/format";
import { MONTHS_FR } from "../../src/shared/utils/date";
import { dailyAllowance } from "../../src/shared/utils/dailyAllowance";
import { budgetPace, compactAmount, type PaceTone } from "../../src/shared/utils/budgetPace";
import { previousRange, relativeChange } from "../../src/shared/utils/monthCompare";
import { expenses as expensesApi } from "../../src/shared/api/expenses";
import { buildMonthCurve, type DayTotal, type MonthCurve } from "../../src/shared/utils/monthCurve";

// ═══════════════════════════════════════════════════════════
//  TYPES & AIDES
// ═══════════════════════════════════════════════════════════

interface AlertItem {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  iconBg: string;
  iconColor: string;
  label: string;
  subtitle: string;
  pill: string;
  pillBg: string;
  pillColor: string;
}

const CATEGORY_ICON: Record<
  string,
  React.ComponentProps<typeof MaterialCommunityIcons>["name"]
> = {
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

function categoryIcon(name: string) {
  return CATEGORY_ICON[name] ?? "tag-outline";
}

// ═══════════════════════════════════════════════════════════
//  CONSTANTES GRAPHIQUES
// ═══════════════════════════════════════════════════════════

const DONUT = {
  size: 64,
  stroke: 6,
  get radius() {
    return (this.size - this.stroke) / 2;
  },
  get circumference() {
    return 2 * Math.PI * this.radius;
  },
};

// ═══════════════════════════════════════════════════════════
//  SOUS-COMPOSANTS
// ═══════════════════════════════════════════════════════════

function DonutProgress({ pct }: { pct: number }) {
  const dash = pct * DONUT.circumference;

  return (
    <View style={donutStyles.wrap}>
      <Svg height={DONUT.size} width={DONUT.size}>
        <Circle
          cx={DONUT.size / 2}
          cy={DONUT.size / 2}
          fill="none"
          r={DONUT.radius}
          stroke="#E9DFFB"
          strokeWidth={DONUT.stroke}
        />
        <Circle
          cx={DONUT.size / 2}
          cy={DONUT.size / 2}
          fill="none"
          origin={`${DONUT.size / 2}, ${DONUT.size / 2}`}
          r={DONUT.radius}
          rotation={-90}
          stroke={colors.accent}
          strokeDasharray={`${dash}, ${DONUT.circumference}`}
          strokeLinecap="round"
          strokeWidth={DONUT.stroke}
        />
      </Svg>
      <View style={donutStyles.center}>
        <Text style={donutStyles.pct}>{Math.round(pct * 100)}%</Text>
      </View>
    </View>
  );
}

const donutStyles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    height: DONUT.size,
    justifyContent: "center",
    width: DONUT.size,
  },
  center: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  pct: {
    color: colors.accent,
    fontSize: 11,
    fontFamily: interFonts.bold,
  },
});

// ─────────────────────────────────────────────────────────

function Sparkline({ data }: { data: number[] }) {
  const values = data.length ? data : [0];
  const max = Math.max(...values, 1);

  return (
    <View style={sparkStyles.container}>
      <View style={sparkStyles.track}>
        {values.map((h, i) => {
          const isLast = i === values.length - 1;
          const heightPct = (h / max) * 100;

          return (
            <View key={i} style={sparkStyles.barWrap}>
              <View
                style={[
                  sparkStyles.bar,
                  { height: `${heightPct}%` },
                  isLast && sparkStyles.barLast,
                ]}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const sparkStyles = StyleSheet.create({
  container: {
    height: 48,
    marginTop: 8,
  },
  track: {
    alignItems: "flex-end",
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  barWrap: {
    alignItems: "center",
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
  },
  bar: {
    backgroundColor: `${colors.primary}30`,
    borderRadius: 2,
    width: 4,
  },
  barLast: {
    backgroundColor: "#FFFFFF",
    borderColor: colors.primary,
    borderRadius: 4,
    borderWidth: 2,
    height: 8,
    marginBottom: 2,
    width: 8,
  },
});

// ─────────────────────────────────────────────────────────

function AlertCard({ alert }: { alert: AlertItem }) {
  return (
    <View style={alertStyles.card}>
      <View style={alertStyles.top}>
        <View style={[alertStyles.icon, { backgroundColor: alert.iconBg }]}>
          <MaterialCommunityIcons
            color={alert.iconColor}
            name={alert.icon}
            size={18}
          />
        </View>
        <View style={[alertStyles.pill, { backgroundColor: alert.pillBg }]}>
          <Text style={[alertStyles.pillText, { color: alert.pillColor }]}>
            {alert.pill}
          </Text>
        </View>
      </View>
      <Text style={alertStyles.label}>{alert.label}</Text>
      <Text style={alertStyles.subtitle}>{alert.subtitle}</Text>
    </View>
  );
}

const alertStyles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DCE9FF",
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    width: 150,
  },
  top: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  icon: {
    alignItems: "center",
    borderRadius: 99,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  pill: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 11, fontFamily: interFonts.semibold },
  label: {
    color: colors.text,
    fontSize: 15,
    fontFamily: interFonts.medium,
    marginTop: 4,
  },
  subtitle: { color: colors.textMuted, fontSize: 11, fontFamily: interFonts.semibold },
});

// ─────────────────────────────────────────────────────────

/** Tout reste dans la gamme violette du thème : plus c'est soutenu, plus il faut y prêter attention. */
/** Couleur indicatrice : rouge = à surveiller, vert = très bien. Le reste de la carte reste violet. */
const BAD = "#C0453B";
const GOOD = "#2F8A5F";
const PACE_TONE: Record<PaceTone, { fg: string; bg: string; icon: string }> = {
  none: { fg: colors.textMuted, bg: "#FFFFFF99", icon: "•" },
  over: { fg: BAD, bg: "#FBE4E1", icon: "▲" },
  fast: { fg: BAD, bg: "#FBE4E1", icon: "▲" },
  ok: { fg: GOOD, bg: "#DDF2E6", icon: "✓" },
  slow: { fg: GOOD, bg: "#DDF2E6", icon: "✓" },
};
const OVER_VIOLET = BAD;

const CURVE = { height: 150, padL: 34, padR: 12, padT: 14, padB: 20 };

/**
 * Courbe du mois : dépensé cumulé jour après jour (trait plein, aire dégradée)
 * face au rythme prévu (pointillés de 0 au budget en fin de mois).
 */
function MonthCurveChart({ curve, budget, over }: { curve: MonthCurve; budget: number; over: boolean }) {
  const [width, setWidth] = useState(0);
  const { height, padL, padR, padT, padB } = CURVE;
  const last = curve.cumulative[curve.cumulative.length - 1] ?? 0;
  const yMax = Math.max(budget, last, 1) * 1.08;
  const plotW = Math.max(width - padL - padR, 1);
  const plotH = height - padT - padB;
  const x = (day: number) => padL + (day / curve.days) * plotW;
  const y = (v: number) => padT + plotH - (v / yMax) * plotH;

  const points = [[0, 0], ...curve.cumulative.map((v, i) => [i + 1, v])];
  const line = points.map(([d, v], i) => `${i ? "L" : "M"}${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const endDay = curve.cumulative.length;
  const area = `${line} L${x(endDay).toFixed(1)},${y(0)} L${x(0)},${y(0)} Z`;
  const dotColor = over ? OVER_VIOLET : colors.primary;
  const ongoing = endDay < curve.days;
  const mid = Math.round(curve.days / 2);
  // Étiquette « aujourd'hui » à gauche du point, sauf en début de mois.
  const labelLeft = x(endDay) > padL + 70;

  return (
    <View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 ? (
        <Svg height={height} width={width}>
          <Defs>
            <LinearGradient id="curveFill" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} stopOpacity={0.28} />
              <Stop offset="1" stopColor={colors.primary} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>

          {/* Axe des montants : 0 et budget */}
          <SvgText fill={colors.textMuted} fontFamily={interFonts.medium} fontSize={10} textAnchor="end" x={padL - 6} y={y(0) + 3}>
            0
          </SvgText>
          {budget > 0 ? (
            <SvgText fill={colors.textMuted} fontFamily={interFonts.medium} fontSize={10} textAnchor="end" x={padL - 6} y={y(budget) + 3}>
              {compactAmount(budget)}
            </SvgText>
          ) : null}
          <Line stroke={`${colors.primary}33`} strokeWidth={1} x1={padL} x2={width - padR} y1={y(0)} y2={y(0)} />

          {/* Rythme prévu */}
          {budget > 0 ? (
            <Line
              stroke={colors.primary}
              strokeDasharray="3 4"
              strokeLinecap="round"
              strokeOpacity={0.45}
              strokeWidth={1.5}
              x1={x(0)}
              x2={x(curve.days)}
              y1={y(0)}
              y2={y(budget)}
            />
          ) : null}

          {/* Dépensé cumulé */}
          <Path d={area} fill="url(#curveFill)" />
          <Path d={line} fill="none" stroke={colors.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} />

          {/* Aujourd'hui */}
          {ongoing ? (
            <>
              <Line
                stroke={dotColor}
                strokeDasharray="2 3"
                strokeOpacity={0.5}
                strokeWidth={1}
                x1={x(endDay)}
                x2={x(endDay)}
                y1={y(last)}
                y2={y(0)}
              />
              <SvgText
                fill={dotColor}
                fontFamily={interFonts.semibold}
                fontSize={10}
                textAnchor={labelLeft ? "end" : "start"}
                x={x(endDay) + (labelLeft ? -9 : 9)}
                y={y(last) - 7}
              >
                aujourd'hui
              </SvgText>
            </>
          ) : null}
          <Circle cx={x(endDay)} cy={y(last)} fill="#FFFFFF" r={5.5} stroke={dotColor} strokeWidth={2.5} />

          {/* Jours */}
          {[1, mid, curve.days].map((d) => (
            <SvgText
              fill={colors.textMuted}
              fontFamily={interFonts.medium}
              fontSize={10}
              key={d}
              textAnchor={d === 1 ? "start" : d === curve.days ? "end" : "middle"}
              x={x(d === 1 ? 0 : d)}
              y={height - 4}
            >
              {d}
            </SvgText>
          ))}
        </Svg>
      ) : null}
      </View>
      <View style={gaugeStyles.legend}>
        <View style={[gaugeStyles.legendSolid, { backgroundColor: colors.primary }]} />
        <Text style={gaugeStyles.legendText}>Dépensé</Text>
        {budget > 0 ? (
          <>
            <Text style={[gaugeStyles.legendDots, { color: colors.primary }]}>···</Text>
            <Text style={gaugeStyles.legendText}>Rythme prévu</Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

/** Budget du mois : courbe du dépensé cumulé face au rythme prévu, puis le détail par semaine. */
function BudgetGauge({
  weekly,
  daily,
  spent,
  period,
  currency,
}: {
  weekly: WeeklyExpense[];
  daily: DayTotal[];
  spent: number;
  period: string;
  currency: string;
}) {
  const today = new Date();
  const pace = budgetPace(weekly, spent, period, today);
  const tone = PACE_TONE[pace.tone];
  const curve = buildMonthCurve(daily, period, today);
  const weekMax = Math.max(...weekly.map((w) => Math.max(w.reel, w.prevu)), 1);

  return (
    <View style={gaugeStyles.card}>
      <View pointerEvents="none" style={gaugeStyles.orb} />
      <View pointerEvents="none" style={gaugeStyles.orbSmall} />

      {pace.budget > 0 ? (
        <>
          <View style={gaugeStyles.amountRow}>
            <Text style={gaugeStyles.spent}>{formatMoney(pace.spent, currency)}</Text>
            <Text style={gaugeStyles.budget}> dépensés ce mois</Text>
          </View>
          <Text style={gaugeStyles.budgetLine}>
            sur un budget de dépenses de {formatMoney(pace.budget, currency)} ·{" "}
            <Text style={{ color: tone.fg, fontFamily: interFonts.semibold }}>
              {Math.round(pace.spentShare * 100)} %
            </Text>
          </Text>
        </>
      ) : null}

      {curve.cumulative.length > 0 ? (
        <MonthCurveChart budget={pace.budget} curve={curve} over={pace.tone === "over"} />
      ) : null}

      <View style={[gaugeStyles.messagePill, { backgroundColor: tone.bg }]}>
        <Text style={[gaugeStyles.message, { color: tone.fg }]}>
          {tone.icon} {pace.message}
          {pace.tone === "over"
            ? ` (+${formatMoney(pace.spent - pace.budget, currency)})`
            : ""}
        </Text>
      </View>

      {weekly.length > 0 ? (
        <>
          <Text style={gaugeStyles.weekTitle}>Par semaine</Text>
          <View style={gaugeStyles.weeks}>
            {weekly.map((w, i) => {
              const upcoming = pace.upcoming[i];
              const over = w.prevu > 0 && w.reel > w.prevu;
              return (
                <View key={w.label} style={gaugeStyles.week}>
                  <Text style={[gaugeStyles.weekValue, over && { color: OVER_VIOLET }]}>
                    {upcoming ? "—" : compactAmount(w.reel)}
                  </Text>
                  <View style={gaugeStyles.weekTrack}>
                    {w.prevu > 0 ? (
                      <View style={[gaugeStyles.weekBudget, { bottom: `${(w.prevu / weekMax) * 100}%` }]} />
                    ) : null}
                    <View
                      style={[
                        gaugeStyles.weekBar,
                        {
                          backgroundColor: upcoming ? `${colors.primary}1A` : over ? OVER_VIOLET : `${colors.primary}B3`,
                          height: upcoming ? "6%" : `${Math.max((w.reel / weekMax) * 100, w.reel > 0 ? 4 : 0)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={gaugeStyles.weekLabel}>{w.label}</Text>
                </View>
              );
            })}
          </View>
          {pace.budget > 0 ? (
            <Text style={gaugeStyles.weekHint}>
              Trait : budget de la semaine ≈ {formatMoney(pace.budget / weekly.length, currency)}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  card: {
    backgroundColor: "#EEF1FF",
    borderRadius: 24,
    gap: 8,
    overflow: "hidden",
    padding: 16,
    position: "relative",
  },
  orb: {
    backgroundColor: `${colors.primary}10`,
    borderRadius: 999,
    height: 170,
    position: "absolute",
    right: -56,
    top: -64,
    width: 170,
  },
  orbSmall: {
    backgroundColor: `${colors.primary}08`,
    borderRadius: 999,
    bottom: -40,
    height: 110,
    left: -36,
    position: "absolute",
    width: 110,
  },
  amountRow: { alignItems: "baseline", flexDirection: "row", flexWrap: "wrap" },
  spent: { color: colors.primary, fontFamily: interFonts.bold, fontSize: 22 },
  budget: { color: colors.textMuted, fontFamily: interFonts.medium, fontSize: 14 },
  legend: { alignItems: "center", flexDirection: "row", gap: 6, marginTop: 2 },
  legendSolid: { borderRadius: 2, height: 3, width: 14 },
  legendDots: { fontFamily: interFonts.bold, fontSize: 14, letterSpacing: 1, lineHeight: 14, marginLeft: 8 },
  legendText: { color: colors.textMuted, fontFamily: interFonts.medium, fontSize: 11 },
  budgetLine: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 12, marginTop: -6 },
  messagePill: { alignSelf: "flex-start", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  message: { fontFamily: interFonts.semibold, fontSize: 12 },
  weekTitle: {
    color: colors.textMuted,
    fontFamily: interFonts.semibold,
    fontSize: 11,
    letterSpacing: 0.6,
    marginTop: 8,
    textTransform: "uppercase",
  },
  weeks: { flexDirection: "row", gap: 12, height: 104 },
  week: { alignItems: "center", flex: 1, gap: 4 },
  weekValue: { color: colors.text, fontFamily: interFonts.semibold, fontSize: 11 },
  weekTrack: {
    backgroundColor: "#FFFFFF80",
    borderRadius: 6,
    flex: 1,
    justifyContent: "flex-end",
    overflow: "hidden",
    position: "relative",
    width: "70%",
  },
  weekBar: { borderRadius: 6, width: "100%" },
  weekBudget: {
    backgroundColor: colors.primary,
    height: 1.5,
    left: 0,
    opacity: 0.45,
    position: "absolute",
    right: 0,
    zIndex: 1,
  },
  weekLabel: { color: colors.textMuted, fontFamily: interFonts.medium, fontSize: 11 },
  weekHint: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 10 },
});

interface TileTrend {
  /** Hausse (true) ou baisse (false). */
  up: boolean;
  /** La variation est une bonne nouvelle (vert) ou non (rouge). */
  good: boolean;
  text: string;
}

function StatTile({
  label,
  value,
  sub,
  tone,
  trend,
  onPress,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  trend?: TileTrend | null;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [tileStyles.tile, pressed && tileStyles.tilePressed]}
    >
      <View pointerEvents="none" style={tileStyles.orb} />
      <View pointerEvents="none" style={tileStyles.orbSmall} />
      <Text style={tileStyles.label}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={[tileStyles.value, tone ? { color: tone } : null]}>
        {value}
      </Text>
      {trend ? (
        <View
          style={[
            tileStyles.trendPill,
            { backgroundColor: trend.good ? "#3E8B6714" : "#B4544B14" },
          ]}
        >
          <Text numberOfLines={1} style={[tileStyles.trend, { color: trend.good ? "#3E8B67" : "#B4544B" }]}>
            {trend.up ? "↑" : "↓"} {trend.text}
          </Text>
        </View>
      ) : null}
      {sub ? <Text numberOfLines={1} style={tileStyles.sub}>{sub}</Text> : null}
    </Pressable>
  );
}

const tileStyles = StyleSheet.create({
  tile: {
    backgroundColor: "#EEF1FF",
    borderColor: "#E2E7FB",
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    gap: 4,
    overflow: "hidden",
    padding: 12,
    position: "relative",
  },
  orb: {
    backgroundColor: `${colors.primary}10`,
    borderRadius: 999,
    height: 80,
    position: "absolute",
    right: -26,
    top: -34,
    width: 80,
  },
  orbSmall: {
    backgroundColor: `${colors.primary}08`,
    borderRadius: 999,
    bottom: -22,
    height: 50,
    left: -18,
    position: "absolute",
    width: 50,
  },
  tilePressed: { opacity: 0.8 },
  trendPill: {
    alignSelf: "flex-start",
    borderRadius: 99,
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  trend: { fontSize: 10, fontFamily: interFonts.semibold },
  label: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: interFonts.semibold,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  value: { color: colors.text, fontSize: 17, fontFamily: interFonts.bold, marginTop: 2 },
  sub: { fontFamily: interFonts.regular, color: colors.textMuted, fontSize: 10 },
});

// ═══════════════════════════════════════════════════════════
//  COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════

export default function Dashboard() {
  const userId = useAppStore((s) => s.userId);
  const currency = useAppStore((s) => s.currency);
  const period = useAppStore((s) => s.currentPeriod);
  const userName = useAppStore((s) => s.userName);

  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openNotifications = useCallback(() => router.push("/notifications"), []);

  const [data, setData] = useState<Dashboard | null>(null);
  const [daily, setDaily] = useState<DayTotal[]>([]);
  const [prev, setPrev] = useState<{
    income: number;
    expenses: number;
    savingsRate: number;
    label: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Mois précédent, pour les flèches de tendance. Les dépenses sont comparées à date égale. */
  const loadPrevious = useCallback(
    async (uid: string) => {
      const range = previousRange(period, new Date());
      try {
        const [prevDash, prevDaily] = await Promise.all([
          analytics.dashboard(uid, range.period),
          range.sameDate
            ? expensesApi.daily(uid, { from: range.from, to: range.to })
            : Promise.resolve(null),
        ]);
        const label = new Date(`${range.period}-01T12:00:00`).toLocaleDateString("fr-FR", {
          month: "short",
        });
        setPrev({
          income: prevDash.income,
          expenses: prevDaily
            ? prevDaily.reduce((s, d) => s + d.total, 0)
            : prevDash.expenses,
          savingsRate: prevDash.savings_rate,
          label,
        });
      } catch {
        setPrev(null);
      }
    },
    [period],
  );

  /** Dépenses jour par jour du mois affiché, pour la courbe « Budget du mois ». */
  const loadDaily = useCallback(
    async (uid: string) => {
      const [y, m] = period.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      try {
        setDaily(await expensesApi.daily(uid, { from: `${period}-01`, to: `${period}-${String(lastDay).padStart(2, "0")}` }));
      } catch {
        setDaily([]);
      }
    },
    [period],
  );

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      if (!userId) throw new Error("no-session");
      setData(await analytics.dashboard(userId, period));
      void loadPrevious(userId);
      void loadDaily(userId);
    } catch {
      if (!opts?.silent) {
        setData(null);
        setError(
          userId
            ? "Serveur injoignable. Vérifiez que le backend est démarré."
            : "Session non initialisée. Passez par l'onboarding."
        );
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [userId, period, loadPrevious, loadDaily]);

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
      load();
    }, [load])
  );

  const solde = data
    ? data.remaining_balance ?? data.income - data.expenses
    : 0;

  const alerts: AlertItem[] =
    data?.top_drift_categories.slice(0, 4).map(
      (c: CategoryAnalytics): AlertItem => ({
        icon: categoryIcon(c.name),
        iconBg: c.essential ? "#E8EFFC" : "#FDECEA",
        iconColor: c.essential ? "#5E5B6B" : "#B0544C",
        label: c.name,
        subtitle: "À surveiller",
        pill: formatPct(c.variation_percentage),
        pillBg: "#F3EDFF",
        pillColor: "#4B3B7C",
      })
    ) ?? [];

  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const projectedDate = `${lastDay} ${MONTHS_FR[month - 1].toLowerCase()} ${year}`;

  const goal = data?.savings_goal ?? null;
  const projectedSavings = data?.savings ?? 0;
  const trackMax = Math.max(goal?.target_amount ?? 0, projectedSavings, 1);
  const allowance = data ? dailyAllowance(solde, period, new Date()) : null;
  const variationUp = (data?.monthly_variation ?? 0) >= 0;

  const pctTrend = (change: number | null, upIsGood: boolean): TileTrend | null =>
    change === null || !prev || Math.round(change * 100) === 0
      ? null
      : {
          up: change > 0,
          good: change > 0 === upIsGood,
          text: `${Math.abs(Math.round(change * 100))} % vs ${prev.label}`,
        };
  const incomeTrend = data ? pctTrend(relativeChange(data.income, prev?.income), true) : null;
  const expenseTrend = data ? pctTrend(relativeChange(data.expenses, prev?.expenses), false) : null;
  const rateDelta = data && prev && prev.income > 0 && data.income > 0
    ? Math.round((data.savings_rate - prev.savingsRate) * 100)
    : 0;
  const rateTrend: TileTrend | null =
    rateDelta !== 0 && prev
      ? {
          up: rateDelta > 0,
          good: rateDelta > 0,
          text: `${Math.abs(rateDelta)} pt${Math.abs(rateDelta) > 1 ? "s" : ""} vs ${prev.label}`,
        }
      : null;

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
          <Pressable
            style={styles.retryBtn}
            onPress={() => void load()}
          >
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

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
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Tableau de bord</Text>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ajouter un revenu (salaire, prêt, dividende)"
              onPress={() => router.push("/add-income")}
              style={({ pressed }) => [
                styles.incomeBtn,
                pressed && styles.incomeBtnPressed,
              ]}
            >
              <MaterialCommunityIcons
                color={colors.primary}
                name="bank-plus"
                size={18}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mon compte"
              onPress={() => setMenuOpen(true)}
              style={styles.avatar}
            >
              <MaterialCommunityIcons
                color="#FFFFFF"
                name="account"
                size={18}
              />
            </Pressable>
            <ProfileMenu
              name={userName}
              onClose={closeMenu}
              onNotifications={openNotifications}
              onSignOut={signOut}
              visible={menuOpen}
            />
          </View>
        </View>

        {/* ── Solde Restant ── */}
        <View style={styles.soldeCard}>
          <View pointerEvents="none" style={styles.soldeDecorTop} />
          <View pointerEvents="none" style={styles.soldeDecorBottom} />
          <Text style={styles.soldeLabel}>Solde Restant</Text>
          <Text style={styles.soldeAmount}>
            {formatMoney(solde, currency)}
          </Text>
          {(data?.contributions ?? 0) > 0 && (
            <View style={styles.soldeContribRow}>
              <MaterialCommunityIcons
                color={colors.primary}
                name="piggy-bank"
                size={14}
              />
              <Text style={styles.soldeContribText}>
                dont {formatMoney(data?.contributions ?? 0, currency)} déjà
                versés à l'épargne
              </Text>
            </View>
          )}
          <Sparkline data={data?.sparkline ?? []} />
          {data?.monthly_variation != null && (
            <Pressable
              style={styles.soldeTrend}
              hitSlop={12}
              onPress={() => router.push("/stats-detail")}
            >
              <MaterialCommunityIcons
                color={colors.accent}
                name={
                  data.monthly_variation >= 0
                    ? "trending-up"
                    : "trending-down"
                }
                size={16}
              />
              <Text style={styles.soldeTrendText}>
                {formatPct(data.monthly_variation)} vs mois dernier
              </Text>
            </Pressable>
          )}
        </View>

        {/* ── Ce mois en chiffres ── */}
        {data && (
          <View style={styles.statsHead}>
            <Text style={styles.sectionTitle}>Ce mois</Text>
            <Text style={styles.statsMonth}>
              {MONTHS_FR[month - 1]} {year}
            </Text>
          </View>
        )}
        {data && (
          <View style={styles.statsGrid}>
            <StatTile
              label="Revenus"
              onPress={() => router.push("/income-sources")}
              trend={incomeTrend}
              value={formatMoney(data.income, currency)}
            />
            <StatTile
              label="Dépenses"
              onPress={() => router.push("/analyse")}
              trend={expenseTrend}
              sub={
                data.income > 0
                  ? `${Math.round((data.expenses / data.income) * 100)} % des revenus`
                  : undefined
              }
              value={formatMoney(data.expenses, currency)}
            />
            <StatTile
              label="Taux d'épargne"
              onPress={() => router.push("/savings")}
              trend={rateTrend}
              sub={data.income > 0 ? "de vos revenus" : "aucun revenu saisi"}
              tone={data.savings_rate >= 0 ? colors.success : colors.danger}
              value={`${Math.round(data.savings_rate * 100)} %`}
            />
            {allowance ? (
              <StatTile
                label="Par jour"
                sub={`${allowance.daysLeft} jour${allowance.daysLeft > 1 ? "s" : ""} restant${allowance.daysLeft > 1 ? "s" : ""}`}
                value={formatMoney(allowance.perDay, currency)}
              />
            ) : (
              <StatTile
                label="Économies possibles"
                tone={colors.success}
                value={formatMoney(data.potential_savings, currency)}
              />
            )}
          </View>
        )}

        {/* ── Vigilance Budgétaire ── */}
        {alerts.length > 0 && (
          <>
            <View style={styles.vigilanceHead}>
              <Text style={styles.sectionTitle}>Vigilance Budgétaire</Text>
              {data && data.potential_savings > 0 ? (
                <Text style={styles.vigilanceSub}>
                  {data.categories_in_drift} catégorie{data.categories_in_drift > 1 ? "s" : ""} en hausse ·{" "}
                  {formatMoney(data.potential_savings, currency)} d'économies possibles
                </Text>
              ) : null}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.alertsScroll}
            >
              {alerts.map((alert) => (
                <AlertCard key={alert.label} alert={alert} />
              ))}
            </ScrollView>
          </>
        )}

        {/* ── Budget du mois : jauge + semaines ── */}
        <View style={styles.chartHeader}>
          <Text style={styles.sectionTitle}>Budget du mois</Text>
          <Link href="/budget" asChild>
            <Pressable style={styles.chartFilter}>
              <Text style={styles.chartFilterText}>Détails</Text>
            </Pressable>
          </Link>
        </View>
        <BudgetGauge
          currency={currency}
          daily={daily}
          period={period}
          spent={data?.expenses ?? 0}
          weekly={data?.weekly ?? []}
        />

        {/* ── Épargne Projetée ── */}
        <View style={styles.projectedCard}>
          <View pointerEvents="none" style={styles.projectedDecor} />
          <View style={styles.projectedTop}>
            <Text style={styles.projectedLabel}>Épargne Projetée</Text>
            <Text style={styles.projectedDate}>{projectedDate}</Text>
          </View>
          <Text style={styles.projectedAmount}>
            {formatMoney(data?.savings ?? 0, currency)}
          </Text>
          {data?.monthly_variation != null && (
            <View style={styles.projectedCompare}>
              <Text style={styles.projectedCompareLabel}>
                vs mois dernier
              </Text>
              <View
                style={[
                  styles.projectedDelta,
                  { backgroundColor: variationUp ? "#4F9A78" : "#C2584F" },
                ]}
              >
                <MaterialCommunityIcons
                  color="#FFFFFF"
                  name={
                    data.monthly_variation >= 0
                      ? "arrow-top-right"
                      : "arrow-bottom-right"
                  }
                  size={14}
                />
                <Text style={styles.projectedDeltaText}>
                  {formatPct(data.monthly_variation)}
                </Text>
              </View>
            </View>
          )}
          <View style={styles.projectedBarRow}>
            <Text style={styles.projectedBarMarker}>
              {formatMoney(0, currency)}
            </Text>
            <View style={styles.projectedBarTrack}>
              <View
                style={[
                  styles.projectedBarFill,
                  {
                    width: `${Math.min(
                      (Math.max(projectedSavings, 0) / trackMax) * 100,
                      100
                    )}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.projectedBarMarker}>
              {formatMoney(trackMax, currency)}
            </Text>
          </View>
        </View>

        {/* ── Épargne Réalisée ── */}
        {goal && (
          <View style={styles.savingsCard}>
            <View pointerEvents="none" style={styles.savingsDecorTop} />
            <View pointerEvents="none" style={styles.savingsDecorBottom} />
            <View style={styles.savingsContent}>
              <View style={styles.savingsLeft}>
                <Text style={styles.savingsLabel}>Épargne Réalisée</Text>
                <Text style={styles.savingsAmount}>
                  {formatMoney(goal.current_amount, currency)}
                </Text>
                <Text style={styles.savingsGoal}>
                  Objectif : {formatMoney(goal.target_amount, currency)}
                </Text>
              </View>
              <DonutProgress pct={goal.progress_percentage} />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scrollContent: { gap: 20, padding: 16 },

  centered: {
    alignItems: "center",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: interFonts.semibold,
    lineHeight: 18,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 99,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: "#FFFFFF", fontSize: 13, fontFamily: interFonts.bold },

  /* Header */
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    zIndex: 10,
  },
  headerTitle: { color: colors.text, fontSize: 18, fontFamily: interFonts.semibold },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 10 },
  incomeBtn: {
    alignItems: "center",
    backgroundColor: "#F0EDFF",
    borderColor: "#B9B2E6",
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  incomeBtnPressed: { opacity: 0.7 },
  quickAdd: {
    alignItems: "center",
    backgroundColor: "#E4DFFF30",
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  quickAddText: { color: colors.primary, fontSize: 13, fontFamily: interFonts.medium },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },

  /* Solde Restant */
  soldeCard: {
    backgroundColor: "#F0F4FF",
    borderRadius: 24,
    gap: 4,
    padding: 24,
    position: "relative",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
  },
  soldeDecorTop: {
    backgroundColor: `${colors.primary}0D`,
    borderRadius: 999,
    height: 220,
    position: "absolute",
    right: -70,
    top: -70,
    width: 220,
  },
  soldeDecorBottom: {
    backgroundColor: "#865DD20B",
    borderRadius: 999,
    height: 160,
    position: "absolute",
    bottom: -40,
    left: -40,
    width: 160,
  },
  soldeLabel: {
    color: "#474552",
    fontSize: 13,
    fontFamily: interFonts.medium,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  soldeAmount: {
    color: colors.primary,
    fontSize: 44,
    fontFamily: interFonts.bold,
    letterSpacing: -2,
    lineHeight: 52,
  },
  soldeTrend: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 4,
  },
  soldeTrendText: { color: colors.accent, fontSize: 11, fontFamily: interFonts.semibold },
  soldeContribRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  soldeContribText: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: interFonts.medium,
  },

  /* Vigilance */
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: -8 },
  statsHead: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between" },
  statsMonth: { color: colors.textMuted, fontSize: 12, fontFamily: interFonts.medium },
  vigilanceHead: { gap: 2 },
  vigilanceSub: { color: colors.textMuted, fontSize: 11, fontFamily: interFonts.medium },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontFamily: interFonts.semibold,
    lineHeight: 26,
  },
  alertsScroll: { gap: 12 },

  /* Réel vs Prévu */
  chartHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  chartFilter: {
    backgroundColor: "#E4DFFF30",
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chartFilterText: { color: colors.primary, fontSize: 13, fontFamily: interFonts.medium },

  /* ═══ Épargne Projetée ═══ */
  projectedCard: {
    backgroundColor: "#EEF1FF",
    borderRadius: 24,
    gap: 10,
    overflow: "hidden",
    padding: 24,
    position: "relative",
  },
  projectedDecor: {
    backgroundColor: `${colors.primary}08`,
    borderRadius: 999,
    height: 180,
    position: "absolute",
    right: -60,
    top: -60,
    width: 180,
  },
  projectedTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  projectedLabel: {
    color: "#474552",
    fontSize: 13,
    fontFamily: interFonts.medium,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  projectedDate: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: interFonts.medium,
  },
  projectedAmount: {
    color: colors.primary,
    fontSize: 44,
    fontFamily: interFonts.bold,
    letterSpacing: -2,
    lineHeight: 52,
  },
  projectedCompare: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  projectedCompareLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: interFonts.medium,
  },
  projectedDelta: {
    alignItems: "center",
    backgroundColor: "#4F9A78",
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  projectedDeltaText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: interFonts.semibold,
  },
  projectedBarRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  projectedBarTrack: {
    backgroundColor: `${colors.primary}20`,
    borderRadius: 99,
    flex: 1,
    height: 8,
    overflow: "hidden",
  },
  projectedBarFill: {
    backgroundColor: colors.primary,
    borderRadius: 99,
    height: 8,
  },
  projectedBarMarker: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: interFonts.medium,
    minWidth: 28,
  },

  /* ═══ Épargne Réalisée ═══ */
  savingsCard: {
    backgroundColor: "#F4EEFF",
    borderRadius: 24,
    overflow: "hidden",
    padding: 20,
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  savingsDecorTop: {
    backgroundColor: "#FFFFFF26",
    borderRadius: 999,
    height: 160,
    position: "absolute",
    right: -48,
    top: -48,
    width: 160,
  },
  savingsDecorBottom: {
    backgroundColor: "#572BA00B",
    borderRadius: 999,
    height: 96,
    position: "absolute",
    bottom: -32,
    left: -24,
    width: 96,
  },
  savingsContent: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  savingsLeft: { flex: 1, gap: 2 },
  savingsLabel: {
    color: "#4B3B7C",
    fontSize: 13,
    fontFamily: interFonts.medium,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  savingsAmount: {
    color: "#3A2D66",
    fontSize: 22,
    fontFamily: interFonts.semibold,
    lineHeight: 29,
  },
  savingsGoal: {
    color: "#6E55A8",
    fontSize: 11,
    fontFamily: interFonts.medium,
    marginTop: 4,
  },
});