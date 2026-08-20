import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../src/ui/theme";

const icons = {
  dashboard: "view-dashboard-outline",
  analyse: "chart-timeline-variant-shimmer",
  budget: "wallet-outline",
  savings: "piggy-bank-outline",
} as const;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: "#777888",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 72,
          paddingTop: 7,
        },
        tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons
            color={color}
            name={icons[route.name as keyof typeof icons]}
            size={size}
          />
        ),
      })}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="analyse" options={{ title: "Analyse" }} />
      <Tabs.Screen name="budget" options={{ title: "Budget" }} />
      <Tabs.Screen name="savings" options={{ title: "Épargne" }} />
    </Tabs>
  );
}
