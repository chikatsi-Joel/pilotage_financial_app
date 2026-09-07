import { useState, useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "../src/ui/components";
import { colors } from "../src/ui/theme";

interface Scenario {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  min: number;
  max: number;
  step: number;
  initial: number;
}

const SCENARIOS: Scenario[] = [
  { key: "alimentation", label: "Alimentation", icon: "silverware-fork-knife", min: 200, max: 800, step: 10, initial: 450 },
  { key: "loisirs", label: "Loisirs", icon: "controller", min: 50, max: 500, step: 10, initial: 150 },
  { key: "transport", label: "Transport", icon: "car", min: 20, max: 300, step: 5, initial: 80 },
];

function formatEuro(value: number): string {
  return `${value} \u20AC`;
}

export default function Simulation() {
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(SCENARIOS.map((s) => [s.key, s.initial])),
  );
  const [applied, setApplied] = useState(false);

  const projected = useMemo(() => {
    const total = Object.values(values).reduce((a, b) => a + b, 0);
    const base = SCENARIOS.reduce((a, s) => a + s.initial, 0);
    return 840 + (base - total);
  }, [values]);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      {/* Header */}
      <ScreenHeader title="Budget" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero card */}
        <View style={styles.hero}>
          <View style={styles.heroDeco1} />
          <View style={styles.heroDeco2} />
          <Text style={styles.heroLabel}>Epargne Projetee (Fin de mois)</Text>
          <View style={styles.heroRow}>
            <Text style={styles.heroAmount}>{formatEuro(projected)}</Text>
            <View style={styles.heroBadge}>
              <MaterialCommunityIcons color="#FFFFFF" name="trending-up" size={14} />
              <Text style={styles.heroBadgeText}>
                +{Math.round(((projected - 840) / 840) * 100)}%
              </Text>
            </View>
          </View>
        </View>

        {/* Scenarios */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Testez vos scenarios</Text>
          <Text style={styles.sectionDesc}>
            Ajustez vos depenses prevues pour voir l&apos;impact sur votre epargne.
          </Text>
          <View style={styles.card}>
            {SCENARIOS.map((s, i) => (
              <View key={s.key}>
                <View style={styles.sliderHead}>
                  <View style={styles.sliderLabel}>
                    <MaterialCommunityIcons color={colors.textMuted} name={s.icon} size={20} />
                    <Text style={styles.sliderLabelText}>{s.label}</Text>
                  </View>
                  <Text style={styles.sliderVal}>{formatEuro(values[s.key])}</Text>
                </View>
                <Slider
                  style={styles.slider}
                  minimumValue={s.min}
                  maximumValue={s.max}
                  step={s.step}
                  value={values[s.key]}
                  onValueChange={(v) => setValues((p) => ({ ...p, [s.key]: v as number }))}
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor="#FFFFFF"
                />
                <View style={styles.sliderRange}>
                  <Text style={styles.sliderRangeText}>{formatEuro(s.min)}</Text>
                  <Text style={styles.sliderRangeText}>{formatEuro(s.max)}</Text>
                </View>
                {i < SCENARIOS.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        </View>

        {/* AI Reco */}
        <View style={styles.reco}>
          <View style={styles.recoTop}>
            <View style={styles.recoIcon}>
              <MaterialCommunityIcons color={colors.primary} name="star-four-points" size={20} />
            </View>
            <View style={styles.recoCopy}>
              <Text style={styles.recoTitle}>Suggestion d&apos;optimisation</Text>
              <Text style={styles.recoDesc}>
                En reduisant vos depenses &quot;Loisirs&quot; de 30 euros ce mois-ci, vous pourriez
                atteindre votre objectif d&apos;epargne de 1000 euros pour vos vacances plus
                rapidement.
              </Text>
            </View>
          </View>
          <View style={styles.recoBtns}>
            <Pressable style={styles.btnIgnore}>
              <Text style={styles.btnIgnoreText}>Ignorer</Text>
            </Pressable>
            <Pressable
              style={[styles.btnApply, applied && { opacity: 0.6 }]}
              onPress={() => {
                setValues((p) => ({ ...p, loisirs: Math.max(50, p.loisirs - 30) }));
                setApplied(true);
              }}
            >
              <Text style={styles.btnApplyText}>Appliquer</Text>
              <MaterialCommunityIcons color="#FFFFFF" name="check" size={18} />
            </Pressable>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scroll: { paddingBottom: 32 },

  hero: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    elevation: 4,
    gap: 6,
    marginHorizontal: 16,
    marginTop: 24,
    overflow: "hidden",
    padding: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  heroDeco1: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 999,
    height: 128,
    position: "absolute",
    right: -48,
    top: -48,
    width: 128,
  },
  heroDeco2: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 999,
    height: 96,
    left: -32,
    position: "absolute",
    bottom: -32,
    width: 96,
  },
  heroLabel: {
    color: "rgba(255,255,255,0.80)",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  heroAmount: { color: "#FFFFFF", fontSize: 48, fontWeight: "700", letterSpacing: -2, lineHeight: 56 },
  heroBadge: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  heroBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },

  section: { gap: 4, marginTop: 28 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "600", paddingHorizontal: 16 },
  sectionDesc: { color: colors.textMuted, fontSize: 16, lineHeight: 24, paddingHorizontal: 16 },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    elevation: 2,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  sliderHead: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  sliderLabel: { alignItems: "center", flexDirection: "row", gap: 8 },
  sliderLabelText: { color: colors.text, fontSize: 14, fontWeight: "500" },
  sliderVal: { color: colors.primary, fontSize: 20, fontWeight: "600" },
  slider: { height: 32, marginHorizontal: -8 },
  sliderRange: { flexDirection: "row", justifyContent: "space-between" },
  sliderRangeText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  divider: { backgroundColor: colors.border, height: 1, marginVertical: 12 },

  reco: {
    backgroundColor: "#DCE9FF",
    borderRadius: 16,
    gap: 16,
    marginHorizontal: 16,
    marginTop: 20,
    padding: 16,
  },
  recoTop: { flexDirection: "row", gap: 12 },
  recoIcon: {
    alignItems: "center",
    backgroundColor: `${colors.primary}1A`,
    borderRadius: 99,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  recoCopy: { flex: 1, gap: 4 },
  recoTitle: { color: colors.text, fontSize: 20, fontWeight: "600" },
  recoDesc: { color: colors.textMuted, fontSize: 16, lineHeight: 24 },
  recoBtns: { flexDirection: "row", gap: 12 },
  btnIgnore: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnIgnoreText: { color: colors.primary, fontSize: 14, fontWeight: "500" },
  btnApply: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 12,
    elevation: 2,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  btnApplyText: { color: "#FFFFFF", fontSize: 14, fontWeight: "500" },
});
