import { ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, Metric, Pill, SectionTitle } from "../../src/ui/components";
import { colors } from "../../src/ui/theme";

export default function Dashboard() {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>MARDI 19 AOÛT</Text><Text style={styles.greeting}>Bonjour, Amina</Text></View>
          <View style={styles.avatar}><Text style={styles.avatarText}>A</Text></View>
        </View>
        <Card style={styles.balanceCard}>
          <View style={styles.balanceTop}><Text style={styles.balanceLabel}>Solde disponible ce mois</Text><MaterialCommunityIcons color="#FFFFFF" name="eye-outline" size={20} /></View>
          <Text style={styles.balance}>215 000 <Text style={styles.currency}>FCFA</Text></Text>
          <View style={styles.progressRail}><View style={styles.progressFill} /></View>
          <View style={styles.balanceFooter}><Text style={styles.balanceCaption}>43 % de votre revenu est préservé</Text><Pill label="+ 8 % ce mois" tone="success" /></View>
        </Card>
        <View style={styles.metrics}><Metric icon="cash-plus" label="Revenus" value="500 000" tint={colors.success} /><Metric icon="credit-card-outline" label="Dépenses" value="285 000" tint={colors.accent} /><Metric icon="piggy-bank-outline" label="Épargne" value="120 000" tint={colors.primary} /></View>
        <SectionTitle action="Voir tout" title="À surveiller" />
        <Card><View style={styles.alertRow}><View style={styles.alertIcon}><MaterialCommunityIcons color={colors.warning} name="trending-up" size={23} /></View><View style={styles.alertCopy}><Pill label="À ATTENTION" tone="warning" /><Text style={styles.alertTitle}>Restaurants dépasse votre rythme habituel</Text><Text style={styles.alertText}>+ 18 000 FCFA par rapport à votre moyenne.</Text></View><MaterialCommunityIcons color={colors.textMuted} name="chevron-right" size={24} /></View></Card>
        <SectionTitle title="Vue des dépenses" />
        <Card><View style={styles.chartHeader}><View><Text style={styles.chartTitle}>Cette semaine</Text><Text style={styles.chartAmount}>72 500 FCFA</Text></View><Text style={styles.chartVariation}>− 12 %</Text></View><View style={styles.bars}>{[38, 60, 42, 76, 54, 89, 47].map((height, index) => <View key={index} style={styles.barGroup}><View style={[styles.bar, { height }]} /><Text style={styles.day}>{["L", "M", "M", "J", "V", "S", "D"][index]}</Text></View>)}</View></Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  alertCopy: { flex: 1, gap: 5 }, alertIcon: { alignItems: "center", backgroundColor: colors.warningSoft, borderRadius: 14, height: 47, justifyContent: "center", width: 47 }, alertRow: { alignItems: "center", flexDirection: "row", gap: 12 }, alertText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 }, alertTitle: { color: colors.text, fontSize: 14, fontWeight: "800", lineHeight: 20 }, avatar: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 18, height: 42, justifyContent: "center", width: 42 }, avatarText: { color: colors.primary, fontWeight: "800" }, balance: { color: "#FFFFFF", fontSize: 34, fontWeight: "800", letterSpacing: -1, marginTop: 8 }, balanceCaption: { color: "#E5E1FF", fontSize: 12, flex: 1 }, balanceCard: { backgroundColor: colors.primary, borderColor: colors.primary, gap: 10, marginTop: 26, overflow: "hidden", padding: 20 }, balanceFooter: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 5 }, balanceLabel: { color: "#E5E1FF", fontSize: 13, fontWeight: "600" }, balanceTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, bar: { backgroundColor: colors.primary, borderRadius: 8, width: 12 }, barGroup: { alignItems: "center", gap: 8, justifyContent: "flex-end" }, bars: { alignItems: "flex-end", flexDirection: "row", height: 115, justifyContent: "space-between", marginTop: 16 }, chartAmount: { color: colors.text, fontSize: 21, fontWeight: "800", marginTop: 3 }, chartHeader: { flexDirection: "row", justifyContent: "space-between" }, chartTitle: { color: colors.textMuted, fontSize: 13 }, chartVariation: { color: colors.success, fontSize: 13, fontWeight: "800" }, content: { padding: 20, paddingBottom: 30 }, currency: { fontSize: 15 }, day: { color: colors.textMuted, fontSize: 11 }, eyebrow: { color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 }, greeting: { color: colors.text, fontSize: 25, fontWeight: "800", marginTop: 4 }, header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, metrics: { flexDirection: "row", gap: 12, marginTop: 20 }, progressFill: { backgroundColor: "#FFFFFF", borderRadius: 5, height: 7, width: "43%" }, progressRail: { backgroundColor: "#8E84D4", borderRadius: 5, height: 7, marginTop: 8, overflow: "hidden" }, safeArea: { backgroundColor: colors.background, flex: 1 },
});
