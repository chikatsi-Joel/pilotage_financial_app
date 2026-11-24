import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { ai as aiApi } from "../shared/api/ai";
import { requestPremium } from "../shared/config/legal";
import { useAppStore } from "../shared/store";
import type { AIAnalysis, CategoryExplanation } from "../shared/types";
import { pickRelevantPoints } from "../shared/utils/aiPoints";
import { analysisStatusNote } from "../shared/utils/aiQuota";
import { colors, interFonts } from "./theme";

type Status = "idle" | "loading" | "done" | "error";

/** Ce que le bouton affiche, quelle que soit la source (catégorie ou analyse du mois). */
interface Explanation {
  summary: string;
  points: string[];
  fallback: boolean;
  note: string | null;
  quotaExceeded: boolean;
}

function fromCategory(e: CategoryExplanation): Explanation {
  return {
    summary: e.summary,
    points: e.points,
    fallback: e.fallback,
    note: analysisStatusNote(e),
    quotaExceeded: e.quota_exceeded,
  };
}

function fromMonth(a: AIAnalysis, focus?: string): Explanation {
  return {
    summary: a.summary,
    points: pickRelevantPoints(a, focus),
    fallback: a.fallback === true,
    note: analysisStatusNote(a),
    quotaExceeded: a.quota_exceeded === true,
  };
}

/**
 * Bouton « Comprendre avec l'IA ».
 * - `categoryId` : explication propre à cette catégorie de dépenses pour le mois.
 * - sinon : résumé de l'analyse du mois, avec les points qui citent `focus` (ex. un objectif).
 */
export function AiExplain({
  period,
  categoryId,
  focus,
}: {
  period: string;
  categoryId?: string;
  focus?: string;
}) {
  const userId = useAppStore((s) => s.userId);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<Explanation | null>(null);

  const run = useCallback(async () => {
    if (!userId || status === "loading") return;
    setStatus("loading");
    try {
      setResult(
        categoryId
          ? fromCategory(await aiApi.explainCategory(userId, period, categoryId))
          : fromMonth(await aiApi.analyze(userId, period), focus),
      );
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }, [userId, period, categoryId, focus, status]);

  const label =
    status === "loading"
      ? "Analyse en cours…"
      : status === "done"
        ? "Revoir l'explication"
        : status === "error"
          ? "Réessayer"
          : "Comprendre avec l'IA";

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityLabel="Comprendre avec l'IA"
        accessibilityRole="button"
        accessibilityState={{ busy: status === "loading", disabled: status === "loading" }}
        disabled={status === "loading"}
        onPress={run}
        style={({ pressed }) => [styles.btn, (pressed || status === "loading") && styles.btnDim]}
      >
        {status === "loading" ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <MaterialCommunityIcons color="#FFFFFF" name="chat-processing" size={16} />
        )}
        <Text style={styles.btnText}>{label}</Text>
      </Pressable>

      {status === "loading" ? <Text style={styles.hint}>Cela peut prendre quelques secondes.</Text> : null}

      {status === "error" ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          Analyse impossible pour le moment. Vérifiez votre connexion et réessayez.
        </Text>
      ) : null}

      {status === "done" && result ? <ExplanationView result={result} /> : null}
    </View>
  );
}

function ExplanationView({ result }: { result: Explanation }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.result}>
      {result.fallback ? (
        <Text style={styles.warn}>IA indisponible : explication simplifiée à partir de vos chiffres.</Text>
      ) : null}
      {result.note ? <Text style={styles.warn}>{result.note}</Text> : null}
      {result.quotaExceeded ? (
        <Pressable accessibilityRole="link" hitSlop={6} onPress={requestPremium}>
          <Text style={styles.link}>Passer à Premium : analyses illimitées</Text>
        </Pressable>
      ) : null}
      {result.summary ? <Text style={styles.summary}>{result.summary}</Text> : null}
      {result.points.map((point, i) => (
        <View key={i} style={styles.point}>
          <MaterialCommunityIcons color={colors.primary} name="circle-small" size={20} />
          <Text style={styles.pointText}>{point}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  btn: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 99,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  btnDim: { opacity: 0.75 },
  btnText: { color: "#FFFFFF", fontSize: 12, fontFamily: interFonts.bold },
  hint: { color: colors.textMuted, fontSize: 11, fontFamily: interFonts.regular },
  error: { color: colors.danger, fontSize: 12, fontFamily: interFonts.semibold },
  result: { gap: 6 },
  warn: { color: colors.warning, fontSize: 11, fontFamily: interFonts.semibold },
  link: { color: colors.primary, fontSize: 12, fontFamily: interFonts.semibold, textDecorationLine: "underline" },
  summary: { color: colors.text, fontSize: 13, fontFamily: interFonts.regular, lineHeight: 19 },
  point: { alignItems: "flex-start", flexDirection: "row", gap: 2 },
  pointText: { color: colors.text, flex: 1, fontSize: 12, fontFamily: interFonts.regular, lineHeight: 17 },
});
