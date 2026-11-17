/**
 * Statistiques : page analytique (maquette A + C validée). De haut en bas :
 * 4 chiffres clés, courbe des mois complets avec la prévision et sa zone d'incertitude,
 * carte des catégories (tendance × régularité, taille = habitude), matrice colorée
 * catégories × indicateurs, puis 4 indicateurs complémentaires.
 * Calculs : src/shared/utils/analyticsKpis.ts.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, type DimensionValue } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Line, Polygon, Polyline, Text as SvgText } from "react-native-svg";

import { analytics as analyticsApi } from "../src/shared/api/analytics";
import { useAppStore } from "../src/shared/store";
import type { CategoryAnalytics, MonthlyTotal } from "../src/shared/types";
import {
  CONFIDENCE_LABEL,
  STABILITY_LABEL,
  SWING_FACTOR,
  anomalyTone,
  categoryInsights,
  computeKpis,
  confidenceLevel,
  expectedForMonth,
  MIN_TREND_MONTHS,
  stabilityOf,
  trendTone,
  type CategoryInsight,
  type Kpis,
  type Tone,
} from "../src/shared/utils/analyticsKpis";
import { formatMoney } from "../src/shared/utils/money";
import { ScreenHeader } from "../src/ui/components";
import { colors, interFonts } from "../src/ui/theme";

const MONTH_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const MONTH_LONG = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** Fonds et textes des cases de la matrice (contraste ≥ 4,5:1). */
const TONE: Record<Tone, { bg: string; fg: string }> = {
  good: { bg: "#DDF3E8", fg: "#14613F" },
  warn: { bg: "#FCEBD0", fg: "#8A4B00" },
  bad: { bg: "#F9DEDB", fg: "#8E1F19" },
  info: { bg: "#EFF0F5", fg: "#4B4A57" },
};
const TONE_STROKE: Record<Tone, string> = {
  good: colors.success,
  warn: "#C77D12",
  bad: colors.danger,
  info: colors.primary,
};

const num = (x: number, digits = 0) => x.toFixed(digits).replace(".", ",");
const pct = (x: number, digits = 0) => `${num(x * 100, digits)} %`;
const signedPct = (x: number, digits = 0) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${pct(Math.abs(x), digits)}`;
/** 152 300 → « 152 k » pour les cases étroites. */
const compact = (x: number) => (x >= 10000 ? `${num(x / 1000)} k` : num(x));

function isCurrentMonth(period: string, today: Date): boolean {
  const [y, m] = period.split("-").map(Number);
  return today.getFullYear() === y && today.getMonth() + 1 === m;
}

function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

// ═══════════════════════════════════════════════════════════
//  ÉCRAN
// ═══════════════════════════════════════════════════════════

export default function StatsDetail() {
  const userId = useAppStore((s) => s.userId);
  const period = useAppStore((s) => s.currentPeriod);
  const currency = useAppStore((s) => s.currency);

  const [items, setItems] = useState<CategoryAnalytics[]>([]);
  const [months, setMonths] = useState<MonthlyTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [cats, monthly] = await Promise.all([
        analyticsApi.categories(userId, period),
        analyticsApi.monthly(userId, period, 12).catch(() => [] as MonthlyTotal[]),
      ]);
      setItems(cats);
      setMonths(monthly);
    } catch {
      setError("Statistiques indisponibles. Vérifiez la connexion au serveur.");
    } finally {
      setLoading(false);
    }
  }, [userId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = isCurrentMonth(period, new Date());
  const kpis = useMemo(() => computeKpis(items, months, current ? period : null), [items, months, current, period]);
  const insights = useMemo(() => categoryInsights(items), [items]);
  // Carte tendance × régularité : tendance publiée à partir de 6 mois seulement.
  const analysed = insights.filter((c) => c.historyMonths == null || c.historyMonths >= MIN_TREND_MONTHS);

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <ScreenHeader title="Statistiques" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : insights.length === 0 ? (
          <Text style={styles.empty}>Ajoutez des dépenses sur plusieurs mois pour obtenir des statistiques.</Text>
        ) : (
          <>
            <Text style={styles.intro}>
              {[
                kpis.historyMonths > 0 ? `${kpis.historyMonths} mois analysés` : null,
                `${insights.length} catégories`,
                kpis.confidence != null ? `fiabilité ${CONFIDENCE_LABEL[confidenceLevel(kpis.confidence)]}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <TopKpis kpis={kpis} />
            <ForecastCard months={months} kpis={kpis} period={period} current={current} currency={currency} />
            {analysed.length > 0 ? <CategoryMap insights={analysed} /> : null}
            <Matrix insights={insights} running={current} />
            <BottomKpis kpis={kpis} currency={currency} running={current} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════
//  CHIFFRES CLÉS
// ═══════════════════════════════════════════════════════════

function Tile({ label, value, hint, hintColor }: { label: string; value: string; hint?: string; hintColor?: string }) {
  return (
    <View accessible accessibilityLabel={`${label} : ${value}${hint ? `, ${hint}` : ""}`} style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={styles.tileValue}>
        {value}
      </Text>
      {hint ? <Text style={[styles.tileHint, hintColor ? { color: hintColor } : null]}>{hint}</Text> : null}
    </View>
  );
}

function TopKpis({ kpis: k }: { kpis: Kpis }) {
  const stability = k.volatility == null ? null : stabilityOf(k.volatility);
  return (
    <View style={styles.grid}>
      <Tile
        label="Tendance"
        value={k.trend == null ? "—" : signedPct(k.trend, 1)}
        hint="par mois"
        hintColor={k.trend == null ? undefined : TONE[trendTone(k.trend)].fg}
      />
      <Tile
        label="Régularité"
        value={k.volatility == null ? "—" : `± ${pct(SWING_FACTOR * k.volatility)}`}
        hint={stability ? `Dépenses ${STABILITY_LABEL[stability].toLowerCase()}s` : undefined}
      />
      <Tile
        label="Taux d'épargne"
        value={k.savingsRate == null ? "—" : pct(k.savingsRate)}
        hint={k.fullMonths > 0 ? `sur ${k.fullMonths} mois complets` : "aucun mois complet"}
      />
      <Tile
        label="Fiabilité"
        value={k.confidence == null ? "—" : num(k.confidence, 2)}
        hint={k.confidence == null ? undefined : `${CONFIDENCE_LABEL[confidenceLevel(k.confidence)]} · indice sur 1`}
      />
    </View>
  );
}

function BottomKpis({ kpis: k, currency, running }: { kpis: Kpis; currency: string; running: boolean }) {
  return (
    <View style={styles.grid}>
      <Tile
        label="Concentration"
        value={k.concentration ? `${k.concentration.count} / ${k.concentration.of}` : "—"}
        hint="catégories font 80 %"
      />
      <Tile label="Variabilité" value={k.monthlyCv == null ? "—" : `± ${pct(k.monthlyCv)}`} hint="du total mensuel" />
      <Tile
        label="Économie possible"
        value={formatMoney(k.potentialSaving, currency)}
        hint={running ? "ce mois-ci" : "sur le mois"}
      />
      <Tile
        label="Essentielles"
        value={k.essentialShare == null ? "—" : pct(k.essentialShare)}
        hint="des dépenses habituelles"
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  PRÉVISION (courbe + zone d'incertitude)
// ═══════════════════════════════════════════════════════════

const CW = 330;
const CH = 150;
const PAD_X = 14;
const PLOT_TOP = 14;
const PLOT_BOTTOM = 126;

function ForecastCard({
  months,
  kpis,
  period,
  current,
  currency,
}: {
  months: MonthlyTotal[];
  kpis: Kpis;
  period: string;
  current: boolean;
  currency: string;
}) {
  // Mois complets avec dépenses (6 derniers au plus), puis le point prévu.
  const full = months.filter((m) => m.total > 0 && !(current && m.period === period)).slice(-6);
  const forecast = kpis.forecast;
  if (full.length === 0 && !forecast) return null;

  const fcValue = forecast?.total ?? null;
  const band = forecast?.low != null && forecast?.high != null ? { low: forecast.low, high: forecast.high } : null;
  const values = [
    ...full.map((m) => m.total),
    ...(fcValue != null ? [fcValue] : []),
    ...(band ? [band.low, band.high] : []),
  ];
  const max = Math.max(...values) * 1.05;
  const min = Math.min(...values) * 0.85;
  const y = (v: number) => PLOT_BOTTOM - ((v - min) / Math.max(max - min, 1)) * (PLOT_BOTTOM - PLOT_TOP);
  const slots = full.length + (fcValue != null ? 1 : 0);
  const x = (i: number) => PAD_X + (i * (CW - 2 * PAD_X)) / Math.max(slots - 1, 1);

  const pts = full.map((m, i) => ({ x: x(i), y: y(m.total), label: MONTH_SHORT[Number(m.period.slice(5, 7)) - 1] }));
  const fx = x(slots - 1);
  const last = pts[pts.length - 1];
  const target = current ? period : nextPeriod(period);
  const targetMonth = Number(target.slice(5, 7)) - 1;

  return (
    <View style={styles.card}>
      <View pointerEvents="none" style={styles.orb} />
      <Text style={styles.cardLabel}>
        {current ? `Prévision fin ${MONTH_LONG[targetMonth]}` : `Prévision ${MONTH_LONG[targetMonth]}`}
      </Text>
      <View style={styles.forecastRow}>
        <Text style={styles.forecastValue}>{fcValue != null ? formatMoney(fcValue, currency) : "—"}</Text>
        {band ? (
          // Pas de probabilité chiffrée : la couverture de la projection du mois et du total
          // (catégories combinées) n'est pas mesurée ; seule celle par catégorie l'est.
          <Text style={styles.forecastErr}>
            estimation probable entre {formatMoney(band.low, currency)} et {formatMoney(band.high, currency)}
          </Text>
        ) : (
          <Text style={styles.forecastErr}>fourchette dès 12 mois d'historique</Text>
        )}
      </View>
      <Svg
        accessible
        accessibilityLabel={`Dépenses des ${full.length} derniers mois complets. Prévision ${
          fcValue != null ? formatMoney(fcValue, currency) : "indisponible"
        }${band ? `, estimation probable entre ${formatMoney(band.low, currency)} et ${formatMoney(band.high, currency)}` : ""}`}
        height={CH + 14}
        viewBox={`0 0 ${CW} ${CH + 14}`}
        width="100%"
      >
        <Line stroke="#E3E6EE" x1={0} x2={CW} y1={PLOT_BOTTOM + 6} y2={PLOT_BOTTOM + 6} />
        {fcValue != null && last && band ? (
          <Polygon
            fill={colors.primary}
            opacity={0.12}
            points={`${last.x},${last.y} ${fx},${y(band.high)} ${fx},${y(band.low)}`}
          />
        ) : null}
        {pts.length > 1 ? (
          <Polyline
            fill="none"
            points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
            stroke={colors.text}
            strokeLinejoin="round"
            strokeWidth={2.2}
          />
        ) : null}
        {fcValue != null && last ? (
          <Polyline
            fill="none"
            points={`${last.x},${last.y} ${fx},${y(fcValue)}`}
            stroke={colors.primary}
            strokeDasharray="5 4"
            strokeWidth={2.2}
          />
        ) : null}
        {pts.map((p) => (
          <Circle cx={p.x} cy={p.y} fill={colors.text} key={`p${p.x}`} r={3} />
        ))}
        {fcValue != null ? (
          <Circle cx={fx} cy={y(fcValue)} fill="#FFFFFF" r={4.5} stroke={colors.primary} strokeWidth={2.5} />
        ) : null}
        {pts.map((p) => (
          <SvgText fill={colors.textMuted} fontSize={9.5} key={`l${p.x}`} textAnchor="middle" x={p.x} y={CH + 8}>
            {p.label}
          </SvgText>
        ))}
        {fcValue != null ? (
          <SvgText fill={colors.primary} fontSize={9.5} fontWeight="bold" textAnchor="middle" x={fx} y={CH + 8}>
            {MONTH_SHORT[targetMonth]}
          </SvgText>
        ) : null}
      </Svg>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  CARTE DES CATÉGORIES (tendance × régularité)
// ═══════════════════════════════════════════════════════════

const MAP_H = 240;

function CategoryMap({ insights }: { insights: CategoryInsight[] }) {
  const xMax = Math.max(0.6, ...insights.map((c) => SWING_FACTOR * c.volatility));
  const yAbs = Math.max(0.1, ...insights.map((c) => Math.abs(c.trend)));
  const habitMax = Math.max(...insights.map((c) => c.habit));

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Carte des catégories</Text>
        <Text style={styles.cardNote}>taille = habitude</Text>
      </View>
      <View
        accessibilityLabel={insights
          .map((c) => `${c.name} : tendance ${signedPct(c.trend)}, ${STABILITY_LABEL[c.stability].toLowerCase()}`)
          .join(". ")}
        accessible
        style={styles.mapWrap}
      >
        <Text style={[styles.axis, { top: -2 }]}>{signedPct(yAbs)}</Text>
        <Text style={[styles.axis, { top: MAP_H / 2 - 7 }]}>0</Text>
        <Text style={[styles.axis, { top: MAP_H - 12 }]}>{signedPct(-yAbs)}</Text>
        <View style={styles.map}>
          <View style={styles.zero} />
          <Text style={[styles.quad, { left: 6, top: 4 }]}>hausse régulière</Text>
          <Text style={[styles.quad, { right: 6, top: 4 }]}>hausse imprévisible</Text>
          <Text style={[styles.quad, { bottom: 4, left: 6 }]}>baisse régulière</Text>
          {insights.map((c) => {
            const size = 14 + 30 * Math.sqrt(c.habit / habitMax);
            // Ramenée entre 6 % et 94 % : une bulle aux extrêmes ne déborde pas du cadre.
            const left = 6 + (Math.min(SWING_FACTOR * c.volatility, xMax) / xMax) * 88;
            const top = 50 - (Math.max(-yAbs, Math.min(yAbs, c.trend)) / yAbs) * 44;
            // Couleur = sens de la dépense : baisse ou stable en vert, hausse en ambre ou rouge.
            const tone = trendTone(c.trend);
            return (
              <View
                key={c.id}
                style={[
                  styles.bubble,
                  {
                    backgroundColor: `${TONE_STROKE[tone]}26`,
                    borderColor: TONE_STROKE[tone],
                    height: size,
                    left: `${left}%` as DimensionValue,
                    marginLeft: -size / 2,
                    marginTop: -size / 2,
                    top: `${top}%` as DimensionValue,
                    width: size,
                  },
                ]}
              >
                <Text numberOfLines={1} style={[styles.bubbleLabel, { top: size + 1 }]}>
                  {c.name}
                </Text>
              </View>
            );
          })}
        </View>
        <View style={styles.xAxis}>
          <Text style={styles.axisX}>régulière</Text>
          <Text style={styles.axisX}>irrégulière</Text>
        </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  MATRICE CATÉGORIES × INDICATEURS
// ═══════════════════════════════════════════════════════════

function Cell({ tone, text, wide }: { tone: Tone; text: string; wide?: boolean }) {
  return (
    <View style={[styles.cell, wide && styles.cellWide, { backgroundColor: TONE[tone].bg }]}>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        numberOfLines={1}
        style={[styles.cellText, { color: TONE[tone].fg }]}
      >
        {text}
      </Text>
    </View>
  );
}

const LEGEND: [Tone, string][] = [
  ["good", "baisse ou stable"],
  ["warn", "hausse à surveiller"],
  ["bad", "forte hausse"],
  ["info", "information"],
];

function Matrix({ insights, running }: { insights: CategoryInsight[]; running: boolean }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Santé de chaque catégorie</Text>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.mRow}>
        <View style={styles.mNameBox} />
        {["Tend.", "Régul.", "Fiab.", "Anom."].map((h) => (
          <Text key={h} style={[styles.mHead, styles.mCol]}>{h}</Text>
        ))}
        <Text style={[styles.mHead, styles.mCol, styles.cellWide]}>Prévu</Text>
      </View>
      {insights.map((c) => {
        const young = c.historyMonths != null && c.historyMonths < 3;
        const noTrend = c.historyMonths != null && c.historyMonths < MIN_TREND_MONTHS;
        const expected = expectedForMonth(c.forecast, c.current, running);
        return (
          <View
            accessibilityLabel={
              young
                ? `${c.name} : historique trop court, prévision ${compact(expected)}`
                : `${c.name} : tendance ${signedPct(c.trend)} par mois, ${STABILITY_LABEL[
                    c.stability
                  ].toLowerCase()}, fiabilité ${CONFIDENCE_LABEL[confidenceLevel(c.confidence)]}, dernier mois ${num(
                    c.anomaly,
                    1,
                  )} sigma, prévu ${compact(expected)}`
            }
            accessible
            key={c.id}
            style={styles.mRow}
          >
            <View style={styles.mNameBox}>
              <Text numberOfLines={1} style={styles.mName}>{c.name}</Text>
            </View>
            <Cell tone={noTrend ? "info" : trendTone(c.trend)} text={noTrend ? "—" : signedPct(c.trend)} />
            {/* Régularité et fiabilité décrivent les données : neutres (dépenser rarement n'est pas un défaut). */}
            <Cell tone="info" text={young ? "—" : pct(SWING_FACTOR * c.volatility)} />
            <Cell tone="info" text={num(c.confidence, 2)} />
            <Cell tone={young ? "info" : anomalyTone(c.anomaly)} text={young ? "—" : `${num(c.anomaly, 1)}σ`} />
            <Cell tone="info" text={compact(expected)} wide />
          </View>
        );
      })}
      <View style={styles.legend}>
        {LEGEND.map(([t, l]) => (
          <View key={t} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: TONE[t].bg }]} />
            <Text style={styles.legendText}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  scroll: { gap: 16, paddingBottom: 48, paddingHorizontal: 18, paddingTop: 2 },
  loader: { marginTop: 40 },
  error: { color: colors.danger, fontFamily: interFonts.medium, fontSize: 13, textAlign: "center" },
  empty: { color: colors.textMuted, fontFamily: interFonts.medium, fontSize: 13, marginTop: 30, textAlign: "center" },
  intro: { color: colors.textMuted, fontFamily: interFonts.medium, fontSize: 12, paddingHorizontal: 2 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    backgroundColor: colors.surface,
    borderColor: "#ECEEF4",
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    gap: 4,
    padding: 14,
  },
  tileLabel: {
    color: colors.textMuted,
    fontFamily: interFonts.semibold,
    fontSize: 10.5,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  tileValue: { color: colors.text, fontFamily: interFonts.bold, fontSize: 21 },
  tileHint: { color: colors.textMuted, fontFamily: interFonts.semibold, fontSize: 11.5 },

  card: {
    backgroundColor: colors.surface,
    borderColor: "#ECEEF4",
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    overflow: "hidden",
    padding: 16,
    position: "relative",
  },
  orb: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 170,
    opacity: 0.06,
    position: "absolute",
    right: -60,
    top: -80,
    width: 170,
  },
  cardLabel: {
    color: colors.textMuted,
    fontFamily: interFonts.semibold,
    fontSize: 10.5,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  cardHead: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between" },
  cardTitle: { color: colors.text, fontFamily: interFonts.bold, fontSize: 14 },
  cardNote: { color: colors.textMuted, fontFamily: interFonts.medium, fontSize: 11 },
  forecastRow: { alignItems: "baseline", flexDirection: "row", gap: 8 },
  forecastValue: { color: colors.text, fontFamily: interFonts.bold, fontSize: 22 },
  forecastErr: { color: colors.textMuted, fontFamily: interFonts.medium, fontSize: 12 },

  mapWrap: { paddingBottom: 4, paddingLeft: 36, paddingRight: 8, position: "relative" },
  map: {
    borderBottomColor: "#D9DCE6",
    borderBottomWidth: 1,
    borderLeftColor: "#D9DCE6",
    borderLeftWidth: 1,
    height: MAP_H,
    position: "relative",
  },
  zero: {
    borderColor: "#C9CDD8",
    borderStyle: "dashed",
    borderTopWidth: 1,
    left: 0,
    position: "absolute",
    right: 0,
    top: "50%",
  },
  axis: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 9.5, left: 0, position: "absolute" },
  xAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  axisX: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 9.5 },
  quad: { color: "#8D8C99", fontFamily: interFonts.semibold, fontSize: 9.5, position: "absolute" },
  bubble: { alignItems: "center", borderRadius: 999, borderWidth: 2, position: "absolute" },
  bubbleLabel: {
    color: colors.text,
    fontFamily: interFonts.semibold,
    fontSize: 10,
    position: "absolute",
    textAlign: "center",
    width: 90,
  },

  mRow: { alignItems: "center", flexDirection: "row", gap: 4 },
  mNameBox: { flex: 1.5 },
  mName: { color: colors.text, fontFamily: interFonts.semibold, fontSize: 12 },
  mHead: {
    color: colors.textMuted,
    fontFamily: interFonts.semibold,
    fontSize: 9.5,
    letterSpacing: 0.3,
    textAlign: "center",
    textTransform: "uppercase",
  },
  mCol: { flex: 1 },
  cell: { alignItems: "center", borderRadius: 8, flex: 1, paddingHorizontal: 2, paddingVertical: 8 },
  cellWide: { flex: 1.15 },
  cellText: { fontFamily: interFonts.bold, fontSize: 11 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 5 },
  legendSwatch: { borderRadius: 3, height: 10, width: 10 },
  legendText: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 10.5 },
});
