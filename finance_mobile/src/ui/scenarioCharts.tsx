import { useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import { LinearGradient as ExpoGradient } from "expo-linear-gradient";
import Svg, { Defs, G, LinearGradient, Rect, Stop, Text as SvgText } from "react-native-svg";

import { colors, interFonts } from "./theme";
import { compactAmount } from "../shared/utils/budgetPace";

const THUMB_W = 62;
const THUMB_H = 30;
const TRACK_H = 10;

/**
 * Curseur d'effort : piste épaisse en dégradé violet, crans tous les 10 %, pastille blanche
 * qui affiche la valeur. Taper ou glisser n'importe où sur la piste ; le geste n'est pas
 * cédé au défilement vertical une fois commencé.
 */
export function EffortSlider({
  value,
  onChange,
  max = 60,
  step = 5,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  max?: number;
  step?: number;
  label: string;
}) {
  const [width, setWidth] = useState(0);
  const pageX = useRef(0);
  const live = useRef({ width, value, onChange });
  live.current = { width, value, onChange };

  const pick = (x: number) => {
    const { width: w, value: v, onChange: cb } = live.current;
    if (w <= 0) return;
    /* La pastille est centrée sur la valeur : la course utile exclut sa demi-largeur de chaque côté. */
    const ratio = Math.min(Math.max((x - THUMB_W / 2) / (w - THUMB_W), 0), 1);
    const next = Math.round((ratio * max) / step) * step;
    if (next !== v) cb(next);
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          /* Les enfants ignorent le toucher : locationX est relatif à la piste. */
          pageX.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
          pick(e.nativeEvent.locationX);
        },
        onPanResponderMove: (e) => pick(e.nativeEvent.pageX - pageX.current),
      }),
    // pick lit l'état courant via `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [max, step],
  );

  const run = Math.max(width - THUMB_W, 0);
  const thumbLeft = (value / max) * run;
  const center = thumbLeft + THUMB_W / 2;
  const ticks = Array.from({ length: Math.floor(max / 10) + 1 }, (_, i) => i * 10);
  const active = value > 0;

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 0, max, now: value, text: `${value} %` }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) =>
        onChange(Math.min(Math.max(value + (e.nativeEvent.actionName === "increment" ? step : -step), 0), max))
      }
    >
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={sliderStyles.hit}
        {...responder.panHandlers}
      >
        <View pointerEvents="none" style={sliderStyles.track}>
          {active ? (
            <ExpoGradient
              colors={["#A79DF0", colors.primary]}
              end={{ x: 1, y: 0 }}
              start={{ x: 0, y: 0 }}
              style={[sliderStyles.fill, { width: center }]}
            />
          ) : null}
          {width > 0
            ? ticks.slice(1, -1).map((t) => {
                const x = THUMB_W / 2 + (t / max) * run;
                return (
                  <View
                    key={t}
                    style={[
                      sliderStyles.tick,
                      { left: x - 2, backgroundColor: x < center ? "#FFFFFFAA" : `${colors.primary}40` },
                    ]}
                  />
                );
              })
            : null}
        </View>
        {width > 0 ? (
          <View pointerEvents="none" style={[sliderStyles.thumb, { left: thumbLeft }, active && sliderStyles.thumbActive]}>
            <Text style={[sliderStyles.thumbText, !active && sliderStyles.thumbTextIdle]}>
              {active ? `−${value} %` : "0 %"}
            </Text>
          </View>
        ) : null}
      </View>
      {width > 0 ? (
        <View pointerEvents="none" style={sliderStyles.scale}>
          {ticks.map((t) => (
            <Text
              key={t}
              style={[
                sliderStyles.scaleText,
                { left: THUMB_W / 2 + (t / max) * run - 12 },
                t === value && sliderStyles.scaleTextOn,
              ]}
            >
              {t}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  hit: { height: 40, justifyContent: "center" },
  track: {
    backgroundColor: `${colors.primary}14`,
    borderRadius: 99,
    height: TRACK_H,
    overflow: "hidden",
  },
  fill: { borderRadius: 99, height: TRACK_H, left: 0, position: "absolute", top: 0 },
  tick: { borderRadius: 2, height: 4, position: "absolute", top: 3, width: 4 },
  thumb: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: `${colors.primary}33`,
    borderRadius: 99,
    borderWidth: 1,
    elevation: 3,
    height: THUMB_H,
    justifyContent: "center",
    position: "absolute",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    top: (40 - THUMB_H) / 2,
    width: THUMB_W,
  },
  thumbActive: { borderColor: colors.primary, borderWidth: 1.5 },
  thumbText: { color: colors.primary, fontFamily: interFonts.bold, fontSize: 12.5 },
  thumbTextIdle: { color: colors.textMuted },
  scale: { height: 14, position: "relative" },
  scaleText: {
    color: `${colors.textMuted}AA`,
    fontFamily: interFonts.medium,
    fontSize: 9.5,
    position: "absolute",
    textAlign: "center",
    width: 24,
  },
  scaleTextOn: { color: colors.primary, fontFamily: interFonts.bold },
});

// ─────────────────────────────────────────────────────────

const MONTHS_SHORT = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
const BARS = { height: 170, padT: 26, padB: 20, gap: 5 };
/** Mois dont le nom est affiché sous la barre (1er, 4e, 7e, 12e). */
const LABELED = new Set([0, 3, 6, 11]);

/**
 * Économie cumulée sur les 12 prochains mois : une colonne arrondie par mois,
 * de plus en plus soutenue, la dernière en violet plein avec le total.
 */
export function YearBars({ monthly, today = new Date() }: { monthly: number; today?: Date }) {
  const [width, setWidth] = useState(0);
  const { height, padT, padB, gap } = BARS;
  const plotH = height - padT - padB;
  const barW = Math.max((width - gap * 11) / 12, 1);
  const max = Math.max(monthly * 12, 1);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 ? (
        <Svg height={height} width={width}>
          <Defs>
            <LinearGradient id="barFill" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} stopOpacity={0.55} />
              <Stop offset="1" stopColor={colors.primary} stopOpacity={0.18} />
            </LinearGradient>
            <LinearGradient id="barLast" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor="#7A6EE0" />
              <Stop offset="1" stopColor={colors.primary} />
            </LinearGradient>
          </Defs>
          {Array.from({ length: 12 }, (_, i) => {
            const v = monthly * (i + 1);
            const h = Math.max((v / max) * plotH, 4);
            const x = i * (barW + gap);
            const last = i === 11;
            const half = i === 5;
            const month = MONTHS_SHORT[(today.getMonth() + i + 1) % 12];
            return (
              <G key={i}>
                <Rect
                  fill={last ? "url(#barLast)" : "url(#barFill)"}
                  height={h}
                  opacity={last ? 1 : 0.55 + (i / 11) * 0.45}
                  rx={Math.min(barW / 2, 7)}
                  width={barW}
                  x={x}
                  y={padT + plotH - h}
                />
                {last || half ? (
                  <SvgText
                    fill={last ? colors.primary : colors.textMuted}
                    fontFamily={interFonts.bold}
                    fontSize={last ? 12.5 : 10.5}
                    textAnchor={last ? "end" : "middle"}
                    x={last ? x + barW : x + barW / 2}
                    y={padT + plotH - h - 8}
                  >
                    {`+${compactAmount(v)}`}
                  </SvgText>
                ) : null}
                {LABELED.has(i) ? (
                  <SvgText
                    fill={last ? colors.primary : colors.textMuted}
                    fontFamily={last ? interFonts.semibold : interFonts.medium}
                    fontSize={10}
                    textAnchor={i === 0 ? "start" : last ? "end" : "middle"}
                    x={i === 0 ? x : last ? x + barW : x + barW / 2}
                    y={height - 5}
                  >
                    {month}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
