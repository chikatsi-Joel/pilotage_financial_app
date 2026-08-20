import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, Pill, SectionTitle } from "../../src/ui/components";
import { colors } from "../../src/ui/theme";

const categories = [
  ["Alimentation", "120 000", "145 000", "basket-outline", colors.primary],
  ["Transport", "48 000", "60 000", "car-outline", colors.accent],
  ["Loisirs", "37 000", "30 000", "party-popper", colors.warning],
] as const;

export default function Budget() {
  return <SafeAreaView edges={["top"]} style={styles.safeArea}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>AOÛT 2026</Text><Text style={styles.title}>Votre budget</Text></View><View style={styles.monthButton}><MaterialCommunityIcons color={colors.primary} name="calendar-month-outline" size={20} /></View></View>
    <Card style={styles.hero}><Text style={styles.heroLabel}>Budget recommandé</Text><Text style={styles.heroAmount}>380 000 <Text style={styles.heroCurrency}>FCFA</Text></Text><Text style={styles.heroCopy}>Une enveloppe équilibrée pour préserver vos objectifs.</Text><View style={styles.heroFooter}><View><Text style={styles.smallLabel}>Épargne suggérée</Text><Text style={styles.savings}>120 000 FCFA</Text></View><Pill label="RÉALISTE" tone="success" /></View></Card>
    <SectionTitle action="Modifier" title="Répartition proposée" />
    <View style={styles.categoryList}>{categories.map(([name, spent, target, icon, tint]) => <Card key={name} style={styles.category}><View style={[styles.categoryIcon, { backgroundColor: `${tint}18` }]}><MaterialCommunityIcons color={tint} name={icon} size={22} /></View><View style={styles.categoryCopy}><View style={styles.categoryTitleRow}><Text style={styles.categoryName}>{name}</Text><Text style={styles.categoryAmount}>{spent}</Text></View><View style={styles.rail}><View style={[styles.fill, { backgroundColor: tint, width: name === "Loisirs" ? "88%" : name === "Transport" ? "62%" : "72%" }]} /></View><Text style={styles.target}>sur {target} FCFA prévus</Text></View></Card>)}</View>
    <SectionTitle title="Conseil du mois" />
    <View style={styles.tip}><MaterialCommunityIcons color="#FFFFFF" name="lightbulb-on-outline" size={24} /><View style={styles.tipCopy}><Text style={styles.tipTitle}>Réduire sans se priver</Text><Text style={styles.tipText}>Limiter les sorties à 2 cette semaine pourrait libérer 15 000 FCFA.</Text></View></View>
    <Pressable style={styles.primaryAction}><Text style={styles.primaryActionText}>Valider ce budget</Text><MaterialCommunityIcons color="#FFFFFF" name="arrow-right" size={20} /></Pressable>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  category: { alignItems: "center", flexDirection: "row", gap: 13, padding: 15 }, categoryAmount: { color: colors.text, fontSize: 14, fontWeight: "800" }, categoryCopy: { flex: 1, gap: 7 }, categoryIcon: { alignItems: "center", borderRadius: 14, height: 45, justifyContent: "center", width: 45 }, categoryList: { gap: 10 }, categoryName: { color: colors.text, fontWeight: "800" }, categoryTitleRow: { flexDirection: "row", justifyContent: "space-between" }, content: { padding: 20, paddingBottom: 32 }, eyebrow: { color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 }, fill: { borderRadius: 4, height: "100%" }, header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, hero: { backgroundColor: colors.text, borderColor: colors.text, gap: 8, marginTop: 24, padding: 21 }, heroAmount: { color: "#FFFFFF", fontSize: 31, fontWeight: "800" }, heroCopy: { color: "#C9D1DF", fontSize: 13, lineHeight: 19 }, heroCurrency: { fontSize: 14 }, heroFooter: { alignItems: "center", borderTopColor: "#304158", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 9, paddingTop: 14 }, heroLabel: { color: "#C9D1DF", fontSize: 13, fontWeight: "700" }, monthButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 14, height: 43, justifyContent: "center", width: 43 }, primaryAction: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 17, flexDirection: "row", gap: 9, justifyContent: "center", marginTop: 26, paddingVertical: 16 }, primaryActionText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" }, rail: { backgroundColor: colors.surfaceMuted, borderRadius: 4, height: 7, overflow: "hidden" }, safeArea: { backgroundColor: colors.background, flex: 1 }, savings: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", marginTop: 3 }, smallLabel: { color: "#AAB5C7", fontSize: 11 }, target: { color: colors.textMuted, fontSize: 11 }, tip: { alignItems: "flex-start", backgroundColor: colors.accent, borderRadius: 21, flexDirection: "row", gap: 12, padding: 17 }, tipCopy: { flex: 1, gap: 4 }, tipText: { color: "#F1EBFF", fontSize: 12, lineHeight: 18 }, tipTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" }, title: { color: colors.text, fontSize: 25, fontWeight: "800", marginTop: 4 },
});
