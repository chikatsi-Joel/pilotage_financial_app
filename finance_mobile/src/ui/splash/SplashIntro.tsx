/**
 * Intro animée au lancement, enchaînée sans couture avec le splash natif (même fond, même
 * marque au même endroit : SPLASH_MARK_SIZE = imageWidth du plugin expo-splash-screen).
 *
 * Déroulé (~2,9 s) : le « L » respire et son point rebondit ; la marque glisse et rétrécit ;
 * « u c ı a » montent une à une ; le point saute en arc et devient le point du « ı » : le logo
 * écrit « Lucia ». Puis le slogan, et un fondu dès que l'app est prête.
 * « Réduire les animations » : l'écran final s'affiche directement.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import * as SplashScreen from "expo-splash-screen";

import { Animation } from "../animations/Animation";
import { fonts, interFonts } from "../theme";
import { FINAL_SCALE, splashLayout } from "./geometry";

/** Fond et taille de la marque : doivent rester égaux à la configuration du splash natif. */
export const SPLASH_BACKGROUND = "#584CB9";
export const SPLASH_MARK_SIZE = 200;
const DOT_COLOR = "#CFC6FF";
const LETTERS = ["u", "c", "ı", "a"] as const;
const DOTLESS_I = 2;

/** Calendrier (ms depuis l'apparition). */
const T = {
  slide: 1050,
  slideMs: 650,
  letters: 1280,
  letterStep: 85,
  letterMs: 560,
  hop: 1700,
  hopMs: 620,
  tagline: 2350,
  done: 2900,
  exitMs: 320,
} as const;
const SPRING = Easing.bezier(0.34, 1.56, 0.64, 1);
const OUT = Easing.bezier(0.2, 0.8, 0.2, 1);

const timing = (value: Animated.Value, toValue: number, duration: number, easing = OUT, delay = 0) =>
  Animated.timing(value, { delay, duration, easing, toValue, useNativeDriver: true });

interface Measure {
  wordWidth: number;
  iCenter: number; // centre du « ı », relatif au mot
}

export function SplashIntro({
  ready,
  fontsReady,
  onDone,
}: {
  /** L'app peut s'afficher (polices et configuration chargées). */
  ready: boolean;
  /** Polices chargées : le mot n'est mesuré et affiché qu'en Poppins. */
  fontsReady: boolean;
  onDone: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const geo = splashLayout(width, height, SPLASH_MARK_SIZE);
  const startedAt = useRef(Date.now());
  const nativeHidden = useRef(false);
  const measured = useRef<Partial<Measure>>({});
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [sequenceDone, setSequenceDone] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Valeurs animées : marque, point (coin haut-gauche + échelle + écrasement), lettres, mot, slogan.
  const v = useRef({
    markX: new Animated.Value(0),
    markScale: new Animated.Value(1),
    dotX: new Animated.Value(geo.dot.x - geo.dotSize / 2),
    dotY: new Animated.Value(geo.dot.y - geo.dotSize / 2),
    dotScale: new Animated.Value(1),
    squash: new Animated.Value(0),
    letters: LETTERS.map(() => new Animated.Value(0)),
    pop: new Animated.Value(0),
    tagline: new Animated.Value(0),
    exit: new Animated.Value(1),
  }).current;

  const hideNativeSplash = useCallback(() => {
    if (nativeHidden.current) return;
    nativeHidden.current = true;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));
  }, []);

  // 1. Rebond du point, en même temps que le « L » (Lottie).
  useEffect(() => {
    if (reduceMotion !== false) return;
    const base = geo.dot.y - geo.dotSize / 2;
    Animated.parallel([
      Animated.sequence([
        timing(v.dotY, base - geo.dotLift, 300, Easing.out(Easing.quad)),
        timing(v.dotY, base, 265, Easing.in(Easing.quad)),
        timing(v.dotY, base - geo.dotLift * 0.25, 135, Easing.out(Easing.quad)),
        timing(v.dotY, base, 130, Easing.in(Easing.quad)),
      ]),
      Animated.sequence([
        timing(v.squash, 0, 500),
        timing(v.squash, 1, 65),
        timing(v.squash, 0, 200, SPRING),
      ]),
    ]).start();
    // Une seule fois, au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const onWordLayout = useCallback((e: LayoutChangeEvent) => {
    measured.current.wordWidth = e.nativeEvent.layout.width;
    if (measured.current.iCenter !== undefined) setMeasure(measured.current as Measure);
  }, []);
  const onILayout = useCallback((e: LayoutChangeEvent) => {
    const { x, width: w } = e.nativeEvent.layout;
    measured.current.iCenter = x + w / 2;
    if (measured.current.wordWidth !== undefined) setMeasure(measured.current as Measure);
  }, []);

  // 2 à 5. Une fois le mot mesuré : glissement, lettres, saut du point, slogan.
  useEffect(() => {
    if (!measure || reduceMotion === null) return;
    const place = geo.withWord(measure.wordWidth);
    const slid = place.dotAfterSlide;
    const target = place.tittle(place.wordLeft + measure.iCenter);
    const half = geo.dotSize / 2;
    const finalDot = geo.tittleSize / geo.dotSize;

    if (reduceMotion) {
      v.markX.setValue(place.tx);
      v.markScale.setValue(FINAL_SCALE);
      v.dotX.setValue(target.x - half);
      v.dotY.setValue(target.y - half);
      v.dotScale.setValue(finalDot);
      v.letters.forEach((l) => l.setValue(1));
      v.tagline.setValue(1);
      setSequenceDone(true);
      return;
    }

    const offset = Math.max(0, T.slide - (Date.now() - startedAt.current));
    const at = (ms: number) => Math.max(0, ms - T.slide) + offset;
    const hopPeak = Math.min(slid.y, target.y) - geo.fontSize * 0.9;
    const sequence = Animated.parallel([
      // Marque et point glissent ensemble (léger rebond).
      timing(v.markX, place.tx, T.slideMs, SPRING, at(T.slide)),
      timing(v.markScale, FINAL_SCALE, T.slideMs, SPRING, at(T.slide)),
      timing(v.dotX, slid.x - half, T.slideMs, SPRING, at(T.slide)),
      timing(v.dotY, slid.y - half, T.slideMs, SPRING, at(T.slide)),
      timing(v.dotScale, FINAL_SCALE, T.slideMs, SPRING, at(T.slide)),
      // Lettres en ressort.
      ...v.letters.map((l, i) =>
        timing(l, 1, T.letterMs, SPRING, at(T.letters + i * T.letterStep)),
      ),
      // Saut en arc : horizontal régulier, montée puis descente.
      Animated.sequence([
        Animated.delay(at(T.hop)),
        Animated.parallel([
          timing(v.dotX, target.x - half, T.hopMs, Easing.inOut(Easing.quad)),
          timing(v.dotScale, finalDot, T.hopMs, Easing.inOut(Easing.quad)),
          Animated.sequence([
            timing(v.dotY, hopPeak - half, T.hopMs / 2, Easing.out(Easing.quad)),
            timing(v.dotY, target.y - half, T.hopMs / 2, Easing.in(Easing.quad)),
          ]),
        ]),
        // Atterrissage : écrasement du point et petit « pop » du mot.
        Animated.parallel([
          Animated.sequence([timing(v.squash, 1, 70), timing(v.squash, 0, 220, SPRING)]),
          Animated.sequence([timing(v.pop, 1, 110), timing(v.pop, 0, 260, SPRING)]),
        ]),
      ]),
      timing(v.tagline, 1, 450, OUT, at(T.tagline)),
    ]);
    sequence.start(() => setSequenceDone(true));
    return () => sequence.stop();
    // Le calendrier démarre une fois, quand la mesure est connue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, reduceMotion]);

  // Fondu de sortie : app prête et animation terminée.
  useEffect(() => {
    if (!ready || !sequenceDone || leaving) return;
    const wait = Math.max(0, T.done - (Date.now() - startedAt.current));
    const timer = setTimeout(() => {
      setLeaving(true);
      timing(v.exit, 0, T.exitMs, Easing.in(Easing.quad)).start(() => onDone());
    }, wait);
    return () => clearTimeout(timer);
  }, [ready, sequenceDone, leaving, v.exit, onDone]);

  const place = measure ? geo.withWord(measure.wordWidth) : null;
  const rise = geo.fontSize * 0.45;
  return (
    <Animated.View
      accessibilityLabel="Lucia, chargement"
      onLayout={hideNativeSplash}
      pointerEvents={leaving ? "none" : "auto"}
      style={[styles.root, { opacity: v.exit }]}
    >
      <Animated.View
        style={[
          styles.mark,
          {
            height: SPLASH_MARK_SIZE,
            left: (width - SPLASH_MARK_SIZE) / 2,
            top: (height - SPLASH_MARK_SIZE) / 2,
            transform: [{ translateX: v.markX }, { scale: v.markScale }],
            width: SPLASH_MARK_SIZE,
          },
        ]}
      >
        <Animation height={SPLASH_MARK_SIZE} loop={false} name="splashMarkL" />
      </Animated.View>

      {fontsReady ? (
        <Animated.View
          onLayout={onWordLayout}
          style={[
            styles.word,
            {
              left: place?.wordLeft ?? 0,
              top: place?.wordTop ?? 0,
              transform: [{ scale: v.pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
            },
          ]}
        >
          {LETTERS.map((letter, i) => {
            const p = v.letters[i];
            return (
              <Animated.Text
                key={letter}
                onLayout={i === DOTLESS_I ? onILayout : undefined}
                style={[
                  styles.letter,
                  {
                    fontSize: geo.fontSize,
                    opacity: p.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
                    transform: [
                      { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) },
                      { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ["-12deg", "0deg"] }) },
                      { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
                    ],
                  },
                ]}
              >
                {letter}
              </Animated.Text>
            );
          })}
        </Animated.View>
      ) : null}

      <Animated.View
        style={[
          styles.dot,
          {
            height: geo.dotSize,
            transform: [
              { translateX: v.dotX },
              { translateY: v.dotY },
              { scale: v.dotScale },
              { scaleX: v.squash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) },
              { scaleY: v.squash.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] }) },
            ],
            width: geo.dotSize,
          },
        ]}
      />

      {fontsReady ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.taglineWrap,
            {
              opacity: v.tagline,
              top: geo.baseline + geo.fontSize * 0.45,
              transform: [{ translateY: v.tagline.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            },
          ]}
        >
          <Text style={styles.tagline}>Vos finances, sous contrôle.</Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: SPLASH_BACKGROUND,
    bottom: 0,
    elevation: 50,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 50,
  },
  mark: { position: "absolute" },
  word: { flexDirection: "row", position: "absolute" },
  letter: {
    color: "#FFFFFF",
    fontFamily: fonts.bold,
    includeFontPadding: false,
  },
  dot: { backgroundColor: DOT_COLOR, borderRadius: 999, left: 0, position: "absolute", top: 0 },
  taglineWrap: { left: 0, position: "absolute", right: 0 },
  tagline: {
    color: "rgba(255,255,255,0.8)",
    fontFamily: interFonts.medium,
    fontSize: 14,
    textAlign: "center",
  },
});
