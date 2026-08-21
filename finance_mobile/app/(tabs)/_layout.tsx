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
          backgroundColor: "rgba(255,255,255,0.85)",
          borderTopColor: "transparent",
          borderRadius: 28,
          height: 64,
          marginHorizontal: 16,
          marginBottom: 12,
          paddingTop: 7,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 0,
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
