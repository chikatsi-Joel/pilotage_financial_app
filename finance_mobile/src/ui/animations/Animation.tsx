/**
 * Animations Lottie de Lucia (fichiers dans assets/lottie, palette violette, générés sur
 * mesure). « Réduire les animations » (accessibilité) : image figée sur la dernière frame.
 */
import { useEffect, useState } from "react";
import { AccessibilityInfo, type StyleProp, View, type ViewStyle } from "react-native";
import LottieView from "lottie-react-native";

const SOURCES = {
  /** Trois points en vague : l'IA prépare une réponse (boucle). */
  aiThinking: require("../../../assets/lottie/ai-thinking.json"),
  /** Disque et coche dessinée : action réussie (une fois). */
  success: require("../../../assets/lottie/success.json"),
  /** Ondes douces derrière l'icône d'un état vide (boucle). */
  emptyPulse: require("../../../assets/lottie/empty-pulse.json"),
  /** Pièce qui tombe et rebondit : versement enregistré (une fois). */
  coinDrop: require("../../../assets/lottie/coin-drop.json"),
  /** Confettis violets et or : objectif atteint (une fois). */
  confetti: require("../../../assets/lottie/confetti.json"),
  /** « L » de la marque au lancement (le point est animé à part) : respire, ondes (une fois). */
  splashMarkL: require("../../../assets/lottie/splash-mark-l.json"),
} as const;

export type AnimationName = keyof typeof SOURCES;

/** Rapport largeur / hauteur de chaque animation (dimensions du fichier). */
const RATIO: Record<AnimationName, number> = {
  aiThinking: 200 / 80,
  success: 1,
  emptyPulse: 1,
  coinDrop: 1,
  confetti: 1,
  splashMarkL: 1,
};

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduce(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** Animation décorative (ignorée par les lecteurs d'écran) ; `height` fixe sa taille. */
export function Animation({
  name,
  height,
  loop = true,
  onFinish,
  style,
}: {
  name: AnimationName;
  height: number;
  loop?: boolean;
  onFinish?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReduceMotion();
  const size = { height, width: height * RATIO[name] };
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[size, style]}
    >
      <LottieView
        autoPlay={!reduceMotion}
        loop={loop && !reduceMotion}
        onAnimationFinish={onFinish ? () => onFinish() : undefined}
        progress={reduceMotion ? 1 : undefined}
        source={SOURCES[name]}
        style={size}
      />
    </View>
  );
}
