import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";

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

export function BackButton({
  onPress,
  color = colors.text,
  size = 22,
  style,
}: {
  onPress?: () => void;
  color?: string;
  size?: number;
  style?: object;
}) {
  return (
    <Pressable
      accessibilityLabel="Retour"
      accessibilityRole="button"
      onPress={onPress || (() => router.back())}
      style={[styles.backBtn, style]}
    >
      <MaterialCommunityIcons color={color} name="arrow-left" size={size} />
    </Pressable>
  );
}

export function ScreenHeader({
  title,
  showBack = true,
  onBack,
  right,
  style,
}: {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.screenHeader, style]}>
      <View style={styles.screenHeaderLeft}>
        {showBack ? <BackButton onPress={onBack} /> : null}
        <Text style={styles.screenHeaderTitle}>{title}</Text>
      </View>
      {right ? <View style={styles.screenHeaderRight}>{right}</View> : null}
    </View>
  );
}

export function ProgressBar({
  progress,
  height = 6,
  color = colors.primary,
  trackColor = colors.surfaceMuted,
  style,
}: {
  progress: number; // 0 to 100 or 0 to 1
  height?: number;
  color?: string;
  trackColor?: string;
  style?: object;
}) {
  const pct = progress > 1 ? Math.min(progress, 100) : Math.min(progress * 100, 100);
  return (
    <View style={[styles.progressTrack, { height, backgroundColor: trackColor }, style]}>
      <View
        style={[
          styles.progressFill,
          {
            backgroundColor: color,
            height: "100%",
            width: `${Math.max(0, pct)}%`,
          },
        ]}
      />
    </View>
  );
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Rechercher...",
  onFilterPress,
  style,
}: {
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  onFilterPress?: () => void;
  style?: object;
}) {
  return (
    <View style={[styles.searchRow, style]}>
      <View style={styles.searchInput}>
        <MaterialCommunityIcons color={colors.textMuted} name="magnify" size={20} />
        <TextInput
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={`${colors.textMuted}80`}
          style={styles.searchTextInput}
          value={value}
        />
      </View>
      {onFilterPress ? (
        <Pressable onPress={onFilterPress} style={styles.filterBtn}>
          <MaterialCommunityIcons color={colors.textMuted} name="tune" size={20} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function FilterTabs({
  options,
  activeOption,
  onSelect,
  style,
}: {
  options: readonly string[];
  activeOption: string;
  onSelect: (option: string) => void;
  style?: object;
}) {
  return (
    <ScrollView
      contentContainerStyle={[styles.filters, style]}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {options.map((opt) => {
        const active = opt === activeOption;
        return (
          <Pressable
            key={opt}
            onPress={() => onSelect(opt)}
            style={[styles.filterPill, active && styles.filterPillActive]}
          >
            <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function EmptyState({
  icon = "text-box-remove-outline",
  title,
  subtitle,
  style,
}: {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle?: string;
  style?: object;
}) {
  return (
    <View style={[styles.emptyContainer, style]}>
      <View style={styles.emptyIconCircle}>
        <MaterialCommunityIcons color={colors.textMuted} name={icon} size={32} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { padding: 4 },
  brandMark: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 22, height: 72, justifyContent: "center", shadowColor: colors.primary, shadowOpacity: 0.2, shadowRadius: 14, width: 72 },
  brandMarkSmall: { borderRadius: 15, height: 46, shadowRadius: 8, width: 46 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24, borderWidth: 1, padding: 18 },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 32 },
  emptyIconCircle: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: 99, height: 64, justifyContent: "center", marginBottom: 12, width: 64 },
  emptySubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4, textAlign: "center" },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "600", textAlign: "center" },
  filterBtn: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: 10, height: 44, justifyContent: "center", width: 44 },
  filterLabel: { color: colors.text, fontSize: 14, fontWeight: "500" },
  filterLabelActive: { color: "#FFFFFF" },
  filterPill: { backgroundColor: colors.surfaceMuted, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 8 },
  filterPillActive: { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  filters: { gap: 8 },
  metric: { flex: 1, gap: 6 },
  metricIcon: { alignItems: "center", borderRadius: 12, height: 38, justifyContent: "center", width: 38 },
  metricLabel: { color: colors.textMuted, fontSize: 12 },
  metricValue: { color: colors.text, fontSize: 16, fontWeight: "800" },
  neutralPill: { backgroundColor: colors.surfaceMuted },
  neutralPillText: { color: colors.primary },
  pill: { alignSelf: "flex-start", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 11, fontWeight: "800" },
  progressFill: { borderRadius: 99 },
  progressTrack: { borderRadius: 99, overflow: "hidden", width: "100%" },
  screenHeader: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.80)", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  screenHeaderLeft: { alignItems: "center", flexDirection: "row", gap: 10 },
  screenHeaderRight: {},
  screenHeaderTitle: { color: colors.text, fontSize: 18, fontWeight: "600" },
  searchRow: { flexDirection: "row", gap: 8 },
  searchInput: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: 12, flex: 1, flexDirection: "row", gap: 8, height: 44, paddingHorizontal: 12 },
  searchTextInput: { color: colors.text, flex: 1, fontSize: 15 },
  sectionAction: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12, marginTop: 26 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: "800" },
  successPill: { backgroundColor: colors.successSoft },
  successPillText: { color: colors.success },
  warningPill: { backgroundColor: colors.warningSoft },
  warningPillText: { color: colors.warning },
});
