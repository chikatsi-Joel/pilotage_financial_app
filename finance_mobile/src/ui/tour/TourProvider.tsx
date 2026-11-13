import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Animated,
  Easing,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Defs, Mask, Rect } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "expo-router";

import { useRemoteFlags } from "../../shared/config/remoteFlags";
import {
  isOnScreen,
  placeBubble,
  shouldAutoStartTour,
  TOUR_SCREENS,
  tourSeenKey,
  type Rect as Box,
  type TourScreen,
  type TourStep,
  type TourTarget,
} from "../../shared/utils/tour";
import { colors, fonts, interFonts } from "../theme";

interface TourApi {
  /** Ref à poser sur l'élément pointé par la visite (`collapsable={false}` sur Android). */
  target: (id: TourTarget) => (node: Node | null) => void;
  /** Lance la visite d'une page (étapes dont l'élément est à l'écran). */
  start: (screen: TourScreen) => void;
  /** Oublie les visites vues : chaque page remontrera la sienne. */
  resetAll: () => Promise<void>;
  /** Incrémenté par resetAll : les pages déjà ouvertes réévaluent leur visite. */
  generation: number;
  active: boolean;
}

/** Instance native d'une View (mesurable). */
type Node = React.ComponentRef<typeof View>;

const TourContext = createContext<TourApi | null>(null);

const PAD = 8;
const BUBBLE_MAX = 340;

/** Visite guidée : écran assombri, élément éclairé, bulle d'explication. */
export function TourProvider({ children }: { children: ReactNode }) {
  const nodes = useRef(new Map<TourTarget, Node>());
  const refs = useRef(new Map<TourTarget, (node: Node | null) => void>());
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const screenRef = useRef<TourScreen | null>(null);
  const [generation, setGeneration] = useState(0);
  const [index, setIndex] = useState(0);

  const target = useCallback((id: TourTarget) => {
    let ref = refs.current.get(id);
    if (!ref) {
      ref = (node: Node | null) => {
        if (node) nodes.current.set(id, node);
        else nodes.current.delete(id);
      };
      refs.current.set(id, ref);
    }
    return ref;
  }, []);

  const start = useCallback((screen: TourScreen) => {
    const all = useRemoteFlags.getState().tour.steps[screen];
    // Seules les étapes dont l'élément est monté : rien ne pointe dans le vide.
    const visible = all.filter((s) => nodes.current.has(s.target));
    if (!visible.length) return;
    screenRef.current = screen;
    setIndex(0);
    setSteps(visible);
  }, []);

  const end = useCallback(() => {
    setSteps(null);
    const screen = screenRef.current;
    if (!screen) return;
    const version = useRemoteFlags.getState().tour.version;
    void AsyncStorage.setItem(tourSeenKey(screen), String(version)).catch(() => undefined);
  }, []);

  const resetAll = useCallback(async () => {
    await AsyncStorage.multiRemove(TOUR_SCREENS.map(tourSeenKey)).catch(() => undefined);
    setGeneration((g) => g + 1);
  }, []);

  // La maintenance prend le dessus : la visite est fermée.
  const maintenance = useRemoteFlags((s) => s.maintenance.enabled);
  useEffect(() => {
    if (maintenance) setSteps(null);
  }, [maintenance]);

  const api = useMemo(
    () => ({ target, start, resetAll, generation, active: steps !== null }),
    [target, start, resetAll, generation, steps],
  );

  return (
    <TourContext.Provider value={api}>
      {/* Pendant la visite, seule la bulle est lue par les lecteurs d'écran. */}
      <View
        accessibilityElementsHidden={steps !== null}
        importantForAccessibility={steps ? "no-hide-descendants" : "auto"}
        style={styles.app}
      >
        {children}
      </View>
      {steps ? (
        <TourOverlay
          index={index}
          node={nodes.current.get(steps[index].target) ?? null}
          onNext={() => (index + 1 < steps.length ? setIndex(index + 1) : end())}
          onSkip={end}
          steps={steps}
        />
      ) : null}
    </TourContext.Provider>
  );
}

/**
 * Lance la visite de la page à sa première ouverture (ou après une nouvelle `tour_version`),
 * une fois `ready` (données affichées), page au premier plan, hors maintenance et hors autre visite.
 * `blocked` : autre surcouche ouverte (menu, modale) ; la visite attend qu'elle se ferme.
 */
export function useAutoTour(screen: TourScreen, ready: boolean, blocked = false): void {
  const tour = useTour();
  const focused = useIsFocused();
  const maintenance = useRemoteFlags((s) => s.maintenance.enabled);
  const decided = useRef(false);

  useEffect(() => {
    decided.current = false; // visites remises à zéro depuis le menu du profil
  }, [tour.generation]);

  useEffect(() => {
    if (!ready || !focused || blocked || maintenance || tour.active || decided.current) return;
    let cancelled = false;
    // Laisse les animations d'apparition de la page se terminer avant de mesurer.
    const timer = setTimeout(() => {
      void AsyncStorage.getItem(tourSeenKey(screen))
        .then((seen) => {
          if (cancelled) return; // conditions changées entre-temps : on réessaiera
          decided.current = true;
          const { enabled, version } = useRemoteFlags.getState().tour;
          if (shouldAutoStartTour(enabled, version, seen)) tour.start(screen);
        })
        .catch(() => {
          decided.current = true; // stockage illisible : on ne force pas la visite
        });
    }, 900); // > durée des FadeIn (≈ 760 ms) : mesure sur la position finale
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [screen, ready, focused, blocked, maintenance, tour]);
}

export function useTour(): TourApi {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour doit être utilisé sous <TourProvider>");
  return ctx;
}

function TourOverlay({
  steps,
  index,
  node,
  onNext,
  onSkip,
}: {
  steps: TourStep[];
  index: number;
  node: Node | null;
  onNext: () => void;
  onSkip: () => void;
}) {
  // Le voile est dessiné dans la même fenêtre que l'app (pas de Modal : sur Android, sa fenêtre
  // ne couvre pas la barre de navigation et son repère peut différer). Les positions sont
  // calculées par rapport au voile lui-même.
  const root = useRef<Node | null>(null);
  const [screen, setScreen] = useState({ width: 0, height: 0 });
  const [box, setBox] = useState<Box | null>(null);
  const [bubbleHeight, setBubbleHeight] = useState(170);
  const fade = useRef(new Animated.Value(0)).current;
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    fade.setValue(0);
    setBox(null);
    let cancelled = false;
    const skip = () => {
      if (!cancelled) {
        cancelled = true;
        onNext();
      }
    };
    if (!node) {
      skip(); // élément disparu entre-temps : étape suivante
      return;
    }
    // Laisse le temps à une éventuelle mise en page de se terminer avant de mesurer.
    const timer = setTimeout(() => {
      const overlay = root.current;
      if (!overlay) {
        skip();
        return;
      }
      overlay.measureInWindow((ox, oy, ow, oh) => {
        node.measureInWindow((x, y, width, height) => {
          if (cancelled) return;
          if (!width || !height) {
            skip();
            return;
          }
          const hole = {
            x: x - ox - PAD,
            y: y - oy - PAD,
            width: width + PAD * 2,
            height: height + PAD * 2,
          };
          // Élément sous la ligne de flottaison (page défilée) : on passe plutôt que pointer hors écran.
          if (oh && !isOnScreen(hole, { width: ow, height: oh })) {
            skip();
            return;
          }
          clearTimeout(fallback);
          setBox(hole);
          Animated.timing(fade, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        });
      });
    }, 60);
    // Filet de sécurité : sans réponse de la mesure (nœud détaché), on n'immobilise pas l'app.
    const fallback = setTimeout(skip, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(fallback);
    };
    // onNext change à chaque rendu : seule l'étape compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, index]);

  // Bouton retour Android : quitte la visite au lieu de naviguer dans l'app.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onSkip();
      return true;
    });
    return () => sub.remove();
  }, [onSkip]);

  const bubbleWidth = Math.min(BUBBLE_MAX, screen.width - 32);
  const place = box && screen.height
    ? placeBubble(box, screen, { width: bubbleWidth, height: bubbleHeight })
    : null;
  const radius = box ? Math.min(20, box.height / 2) : 0;

  return (
    <View
      collapsable={false}
      onLayout={(e) => setScreen({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      // Capte tous les appuis : l'app en dessous reste inerte pendant la visite.
      onStartShouldSetResponder={() => true}
      ref={root}
      style={[StyleSheet.absoluteFill, styles.layer]}
    >
        <Svg height="100%" style={StyleSheet.absoluteFill} width="100%">
          <Defs>
            <Mask id="tour-hole">
              <Rect fill="#FFFFFF" height="100%" width="100%" x={0} y={0} />
              {box ? (
                <Rect fill="#000000" height={box.height} rx={radius} width={box.width} x={box.x} y={box.y} />
              ) : null}
            </Mask>
          </Defs>
          <Rect fill="rgba(11, 28, 48, 0.72)" height="100%" mask="url(#tour-hole)" width="100%" x={0} y={0} />
          {box ? (
            <Rect
              fill="none"
              height={box.height}
              rx={radius}
              stroke={colors.primarySoft}
              strokeWidth={2}
              width={box.width}
              x={box.x}
              y={box.y}
            />
          ) : null}
        </Svg>

        {place ? (
          <Animated.View
            onLayout={(e) => setBubbleHeight(e.nativeEvent.layout.height)}
            style={[styles.bubble, { left: place.left, opacity: fade, top: place.top, width: bubbleWidth }]}
          >
            <View
              style={[
                styles.arrow,
                { left: place.arrowLeft - 8 },
                place.below ? { top: -7 } : { bottom: -7 },
              ]}
            />
            <Text accessibilityRole="header" style={styles.title}>
              {step.title}
            </Text>
            <Text style={styles.text}>{step.text}</Text>
            <View style={styles.footer}>
              <View style={styles.dots}>
                {steps.map((s, i) => (
                  <View key={s.target} style={[styles.dot, i === index && styles.dotActive]} />
                ))}
              </View>
              {!last ? (
                <Pressable accessibilityRole="button" hitSlop={8} onPress={onSkip} style={styles.skip}>
                  <Text style={styles.skipText}>Passer</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={onNext}
                style={({ pressed }) => [styles.next, pressed && { opacity: 0.88 }]}
              >
                <Text style={styles.nextText}>{last ? "Terminer" : "Suivant"}</Text>
              </Pressable>
            </View>
          </Animated.View>
        ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  layer: { elevation: 30, zIndex: 30 },
  bubble: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    elevation: 12,
    gap: 6,
    padding: 16,
    position: "absolute",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  arrow: {
    backgroundColor: colors.surface,
    height: 16,
    position: "absolute",
    transform: [{ rotate: "45deg" }],
    width: 16,
  },
  title: { color: colors.text, fontFamily: fonts.bold, fontSize: 17 },
  text: { color: colors.textMuted, fontFamily: interFonts.regular, fontSize: 14, lineHeight: 20 },
  footer: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 8 },
  dots: { flex: 1, flexDirection: "row", gap: 5 },
  dot: { backgroundColor: `${colors.primary}33`, borderRadius: 4, height: 7, width: 7 },
  dotActive: { backgroundColor: colors.primary, width: 18 },
  skip: { justifyContent: "center", minHeight: 44, paddingHorizontal: 8 },
  skipText: { color: colors.textMuted, fontFamily: interFonts.semibold, fontSize: 14 },
  next: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 18,
  },
  nextText: { color: "#FFFFFF", fontFamily: interFonts.bold, fontSize: 14 },
});
