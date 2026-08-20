import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "./theme";

export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <View style={[styles.brandMark, small && styles.brandMarkSmall]}>
      <MaterialCommunityIcons
        color="#FFFFFF"
        name="chart-areaspline"
        size={small ? 20 : 34}
      />
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <Text style={styles.sectionAction}>{action}</Text> : null}
    </View>
  );
}

export function Pill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning";
}) {
  const style = tone === "success" ? styles.successPill : tone === "warning" ? styles.warningPill : styles.neutralPill;
  const textStyle = tone === "success" ? styles.successPillText : tone === "warning" ? styles.warningPillText : styles.neutralPillText;
  return (
    <View style={[styles.pill, style]}>
      <Text style={[styles.pillText, textStyle]}>{label}</Text>
    </View>
  );
}

export function Metric({ label, value, icon, tint = colors.primary }: {
  label: string;
  value: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  tint?: string;
}) {
  return (
    <View style={styles.metric}>
      <View style={[styles.metricIcon, { backgroundColor: `${tint}18` }]}>
        <MaterialCommunityIcons color={tint} name={icon} size={20} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  brandMark: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 22, height: 72, justifyContent: "center", shadowColor: colors.primary, shadowOpacity: 0.2, shadowRadius: 14, width: 72 },
  brandMarkSmall: { borderRadius: 15, height: 46, shadowRadius: 8, width: 46 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24, borderWidth: 1, padding: 18 },
  metric: { flex: 1, gap: 6 },
  metricIcon: { alignItems: "center", borderRadius: 12, height: 38, justifyContent: "center", width: 38 },
  metricLabel: { color: colors.textMuted, fontSize: 12 },
  metricValue: { color: colors.text, fontSize: 16, fontWeight: "800" },
  neutralPill: { backgroundColor: colors.surfaceMuted },
  neutralPillText: { color: colors.primary },
  pill: { alignSelf: "flex-start", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 11, fontWeight: "800" },
  sectionAction: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12, marginTop: 26 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: "800" },
  successPill: { backgroundColor: colors.successSoft },
  successPillText: { color: colors.success },
  warningPill: { backgroundColor: colors.warningSoft },
  warningPillText: { color: colors.warning },
});
