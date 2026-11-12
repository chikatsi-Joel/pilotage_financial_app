import { useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";

import { colors, interFonts } from "./theme";
import { compactAmount } from "../shared/utils/budgetPace";
import { monotonePath, movingAverage, niceCeil, type Pt } from "../shared/utils/chartPath";
import type { MonthTotal } from "../shared/utils/seasonality";
import { formatMoney } from "../shared/utils/money";

const MONTHS_SHORT = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
const MONTHS_LONG = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const H = 200;
const PAD = { l: 38, r: 14, t: 16, b: 24 };
const TREND_WINDOW = 3;

const monthOf = (p: string) => Number(p.slice(5, 7)) - 1;

/**
 * Série mensuelle des dépenses façon graphique de série temporelle :
 * courbe lissée + aire, tendance (moyenne mobile 3 mois) en pointillés, mois en cours
 * prolongé jusqu'à sa projection de fin de mois. Toucher ou glisser pour lire un mois.
 */
export function SeasonChart({
  months,
  period,
  projectedCurrent,
  partial,
  average,
  currency,
}: {
  months: MonthTotal[];
  period: string;
  projectedCurrent: number;
  partial: boolean;
  average: number | null;
  currency: string;
}) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  /* On commence au premier mois avec des dépenses : les mois vides d'avant ne sont pas de l'historique. */
  const series = useMemo(() => {
    const first = months.findIndex((m) => m.total > 0);
    return (first < 0 ? [] : months.slice(first)).map((m) => ({
      period: m.period,
      value: m.period === period ? projectedCurrent : m.total,
      real: m.total,
      current: m.period === period,
    }));
  }, [months, period, projectedCurrent]);

  const n = series.length;
  const plotW = Math.max(width - PAD.l - PAD.r, 1);
  const plotH = H - PAD.t - PAD.b;
  const top = niceCeil(Math.max(...series.map((s) => s.value), 1) * 1.08);
  const x = (i: number) => PAD.l + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const y = (v: number) => PAD.t + plotH - (v / top) * plotH;

  const live = useRef({ n, plotW });
  live.current = { n, plotW };
  const originX = useRef(0);
  const pick = (px: number) => {
    const { n: count, plotW: w } = live.current;
    if (count === 0) return;
    const i = Math.round(((px - PAD.l) / w) * (count - 1));
    setSelected(Math.min(Math.max(i, 0), count - 1));
  };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          originX.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
          pick(e.nativeEvent.locationX);
        },
        onPanResponderMove: (e) => pick(e.nativeEvent.pageX - originX.current),
      }),
    // pick lit l'état courant via `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (n < 2) return null;

  const pts: Pt[] = series.map((s, i) => [x(i), y(s.value)]);
  const lastPast = partial && series[n - 1].current ? n - 2 : n - 1;
  const solid = monotonePath(pts.slice(0, lastPast + 1));
  const area = `${monotonePath(pts)} L${x(n - 1).toFixed(1)},${y(0)} L${x(0)},${y(0)} Z`;
  const projection = lastPast < n - 1 ? monotonePath(pts.slice(lastPast)) : null;

  const trend = movingAverage(series.map((s) => s.value), TREND_WINDOW);
  const trendPts: Pt[] = trend.flatMap((v, i) => (v === null ? [] : [[x(i), y(v)] as Pt]));
  const ticks = [0, top / 2, top];
  const peak = series.reduce((b, s, i) => (!s.current && s.value > series[b].value ? i : b), 0);
  const labelEvery = n > 8 ? 2 : 1;

  const sel = selected !== null ? series[selected] : null;
  const selVsAvg = sel && average ? sel.value / average - 1 : null;
  const tipLeft = selected !== null ? Math.min(Math.max(x(selected) - 70, 0), Math.max(width - 140, 0)) : 0;

  return (
    <View>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: H }}
        {...responder.panHandlers}
      >
        {width > 0 ? (
          <Svg height={H} pointerEvents="none" width={width}>
            <Defs>
              <LinearGradient id="seasonFill" x1="0" x2="0" y1="0" y2="1">
                <Stop offset="0" stopColor={colors.primary} stopOpacity={0.24} />
                <Stop offset="1" stopColor={colors.primary} stopOpacity={0.01} />
              </LinearGradient>
            </Defs>

            {/* Graduations */}
            {ticks.map((t) => (
              <G key={t}>
                <Line
                  stroke={colors.border}
                  strokeDasharray={t === 0 ? undefined : "1 4"}
                  strokeLinecap="round"
                  strokeWidth={1}
                  x1={PAD.l}
                  x2={width - PAD.r}
                  y1={y(t)}
                  y2={y(t)}
                />
                <SvgText
                  fill={colors.textMuted}
                  fontFamily={interFonts.medium}
                  fontSize={9.5}
                  textAnchor="end"
                  x={PAD.l - 7}
                  y={y(t) + 3}
                >
                  {t === 0 ? "0" : compactAmount(t)}
                </SvgText>
              </G>
            ))}

            <Path d={area} fill="url(#seasonFill)" />

            {/* Tendance : moyenne mobile 3 mois */}
            {trendPts.length > 1 ? (
              <Path
                d={monotonePath(trendPts)}
                fill="none"
                stroke={colors.accent}
                strokeDasharray="5 5"
                strokeLinecap="round"
                strokeOpacity={0.55}
                strokeWidth={1.6}
              />
            ) : null}

            <Path d={solid} fill="none" stroke={colors.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} />
            {projection ? (
              <Path
                d={projection}
                fill="none"
                stroke={colors.primary}
                strokeDasharray="2 5"
                strokeLinecap="round"
                strokeWidth={2.6}
              />
            ) : null}

            {/* Pic */}
            <SvgText
              fill={colors.primary}
              fontFamily={interFonts.bold}
              fontSize={10}
              textAnchor={peak === 0 ? "start" : peak === n - 1 ? "end" : "middle"}
              x={x(peak)}
              y={y(series[peak].value) - 9}
            >
              {`pic ${compactAmount(series[peak].value)}`}
            </SvgText>

            {/* Points */}
            {series.map((s, i) => (
              <Circle
                cx={x(i)}
                cy={y(s.value)}
                fill={s.current && partial ? "#FFFFFF" : colors.primary}
                key={s.period}
                r={s.current ? 5 : i === selected ? 4.5 : 2.6}
                stroke={s.current || i === selected ? colors.primary : "#FFFFFF"}
                strokeWidth={s.current ? 2.4 : 1.2}
              />
            ))}

            {/* Lecture au doigt */}
            {selected !== null ? (
              <Line
                stroke={colors.primary}
                strokeOpacity={0.35}
                strokeWidth={1}
                x1={x(selected)}
                x2={x(selected)}
                y1={PAD.t}
                y2={y(0)}
              />
            ) : null}

            {/* Mois */}
            {series.map((s, i) =>
              (n - 1 - i) % labelEvery === 0 ? (
                <SvgText
                  fill={s.current ? colors.primary : colors.textMuted}
                  fontFamily={s.current ? interFonts.bold : interFonts.medium}
                  fontSize={9.5}
                  key={s.period}
                  textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                  x={x(i)}
                  y={H - 6}
                >
                  {MONTHS_SHORT[monthOf(s.period)]}
                </SvgText>
              ) : null,
            )}
          </Svg>
        ) : null}

        {sel ? (
          <View pointerEvents="none" style={[chartStyles.tip, { left: tipLeft }]}>
            <Text style={chartStyles.tipMonth}>
              {MONTHS_LONG[monthOf(sel.period)]} {sel.period.slice(0, 4)}
            </Text>
            <Text style={chartStyles.tipValue}>
              {sel.current && partial ? "≈ " : ""}
              {formatMoney(sel.value, currency)}
            </Text>
            {selVsAvg !== null ? (
              <Text style={[chartStyles.tipDelta, { color: selVsAvg > 0.05 ? "#FFB4AB" : "#B8F0D2" }]}>
                {selVsAvg >= 0 ? "+" : "−"}
                {Math.abs(Math.round(selVsAvg * 100))} % vs moyenne
              </Text>
            ) : null}
            {sel.current && partial ? (
              <Text style={chartStyles.tipSub}>déjà {formatMoney(sel.real, currency)}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={chartStyles.legend}>
        <View style={chartStyles.legendItem}>
          <View style={[chartStyles.legendLine, { backgroundColor: colors.primary }]} />
          <Text style={chartStyles.legendText}>Dépenses</Text>
        </View>
        {trendPts.length > 1 ? (
          <View style={chartStyles.legendItem}>
            <Text style={[chartStyles.legendDash, { color: colors.accent }]}>– –</Text>
            <Text style={chartStyles.legendText}>Tendance 3 mois</Text>
          </View>
        ) : null}
        {partial ? (
          <View style={chartStyles.legendItem}>
            <View style={chartStyles.legendHollow} />
            <Text style={chartStyles.legendText}>Projection</Text>
          </View>
        ) : null}
      </View>
      <Text style={chartStyles.hint}>Touchez la courbe pour lire un mois.</Text>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  tip: {
    backgroundColor: colors.text,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: "absolute",
    top: 0,
    width: 140,
  },
  tipMonth: { color: "#FFFFFFB3", fontFamily: interFonts.medium, fontSize: 10 },
  tipValue: { color: "#FFFFFF", fontFamily: interFonts.bold, fontSize: 14 },
  tipDelta: { fontFamily: interFonts.semibold, fontSize: 10.5 },
  tipSub: { color: "#FFFFFF99", fontFamily: interFonts.regular, fontSize: 10 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 4 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 6 },
  legendLine: { borderRadius: 2, height: 3, width: 14 },
  legendDash: { fontFamily: interFonts.bold, fontSize: 11, letterSpacing: -1 },
  legendHollow: { borderColor: colors.primary, borderRadius: 99, borderWidth: 2, height: 9, width: 9 },
  legendText: { color: colors.textMuted, fontFamily: interFonts.medium, fontSize: 10.5 },
  hint: { color: `${colors.textMuted}99`, fontFamily: interFonts.regular, fontSize: 9.5, marginTop: 2 },
});
