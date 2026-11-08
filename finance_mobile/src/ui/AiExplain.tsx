import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { ai as aiApi } from "../shared/api/ai";
import { useAppStore } from "../shared/store";
import type { AIAnalysis } from "../shared/types";
import { pickRelevantPoints } from "../shared/utils/aiPoints";
import { colors } from "./theme";

type Status = "idle" | "loading" | "done" | "error";

/**
 * Bouton « Comprendre avec l'IA » : lance l'analyse du mois et affiche le
 * résumé, avec les points qui concernent `focus` (ex. une catégorie).
 */
export function AiExplain({ period, focus }: { period: string; focus?: string }) {
  const userId = useAppStore((s) => s.userId);
  const [status, setStatus] = useState<Status>("idle");
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);

  const run = useCallback(async () => {
    if (!userId || status === "loading") return;
    setStatus("loading");
    try {
      setAnalysis(await aiApi.analyze(userId, period));
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }, [userId, period, status]);

  const points = analysis ? pickRelevantPoints(analysis, focus) : [];

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Comprendre avec l'IA"
        accessibilityState={{ busy: status === "loading", disabled: status === "loading" }}
        disabled={status === "loading"}
        onPress={run}
        style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }, status === "loading" && { opacity: 0.7 }]}
      >
        {status === "loading" ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <MaterialCommunityIcons color="#FFFFFF" name="chat-processing" size={16} />
        )}
        <Text style={styles.btnText}>
          {status === "loading"
            ? "Analyse en cours…"
            : status === "done"
              ? "Relancer l'analyse"
              : status === "error"
                ? "Réessayer"
                : "Comprendre avec l'IA"}
        </Text>
      </Pressable>

      {status === "loading" && (
        <Text style={styles.hint}>Cela peut prendre quelques secondes.</Text>
      )}

      {status === "error" && (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          Analyse impossible pour le moment. Vérifiez le serveur et réessayez.
        </Text>
      )}

      {status === "done" && analysis && (
        <View style={styles.result} accessibilityLiveRegion="polite">
          {analysis.fallback && (
            <Text style={styles.warn}>
              IA indisponible : analyse simplifiée générée localement.
            </Text>
          )}
          {!!analysis.summary && <Text style={styles.summary}>{analysis.summary}</Text>}
          {points.map((point, i) => (
            <View key={i} style={styles.point}>
              <MaterialCommunityIcons color={colors.primary} name="circle-small" size={20} />
              <Text style={styles.pointText}>{point}</Text>
            </View>
          ))}
        </View>
      )}
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
  btnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  hint: { color: colors.textMuted, fontSize: 12 },
  error: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  result: { gap: 6 },
  warn: { color: colors.warning, fontSize: 12, fontWeight: "600" },
  summary: { color: colors.text, fontSize: 14, lineHeight: 21 },
  point: { alignItems: "flex-start", flexDirection: "row", gap: 2 },
  pointText: { color: colors.text, flex: 1, fontSize: 13, lineHeight: 19 },
});
