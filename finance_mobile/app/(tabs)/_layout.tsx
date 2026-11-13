import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, interFonts } from "../../src/ui/theme";
import { useTour } from "../../src/ui/tour/TourProvider";
import type { TourTarget } from "../../src/shared/utils/tour";

/** Onglets expliqués par la visite guidée. */
const TOUR_TABS: Record<string, TourTarget> = {
  analyse: "tab-analyse",
  budget: "tab-budget",
  savings: "tab-savings",
};

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** Icône pleine quand l'onglet est actif, contour sinon. */
const icons: Record<string, { active: IconName; idle: IconName }> = {
  dashboard: { active: "view-dashboard", idle: "view-dashboard-outline" },
  analyse: { active: "receipt-text", idle: "receipt-text-outline" },
  budget: { active: "wallet", idle: "wallet-outline" },
  savings: { active: "piggy-bank", idle: "piggy-bank-outline" },
};

const FALLBACK: { active: IconName; idle: IconName } = {
  active: "circle",
  idle: "circle-outline",
};

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const tour = useTour();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        // Fond clair derrière la barre flottante (sinon le thème système sombre transparaît).
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: "#8A8B9E",
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarStyle: [
          styles.bar,
          // Reste au-dessus de la barre système / indicateur d'accueil.
          { marginBottom: Math.max(insets.bottom, 12) },
        ],
        tabBarIcon: ({ color, focused }) => {
          const set = icons[route.name] ?? FALLBACK;
          return (
            <View
              collapsable={false}
              ref={TOUR_TABS[route.name] ? tour.target(TOUR_TABS[route.name]) : undefined}
              style={[styles.pill, focused && styles.pillActive]}
            >
              <MaterialCommunityIcons
                color={String(color)}
                name={focused ? set.active : set.idle}
                size={22}
              />
            </View>
          );
        },
      })}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="analyse" options={{ title: "Dépenses" }} />
      <Tabs.Screen name="budget" options={{ title: "Budget" }} />
      <Tabs.Screen name="savings" options={{ title: "Épargne" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 0,
    borderRadius: 28,
    height: 68,
    marginHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    shadowColor: "#1B1464",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  item: {
    // Cible tactile pleine hauteur, icône et libellé centrés.
    justifyContent: "center",
  },
  label: {
    fontSize: 10,
    fontFamily: interFonts.bold,
    marginTop: 2,
  },
  pill: {
    alignItems: "center",
    borderRadius: 14,
    height: 30,
    justifyContent: "center",
    width: 54,
  },
  pillActive: {
    backgroundColor: colors.primarySoft,
  },
});
