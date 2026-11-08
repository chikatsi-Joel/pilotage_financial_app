import { DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { PaperProvider } from "react-native-paper";

import { colors, paperTheme } from "../src/ui/theme";

/** Thème de navigation clair fixe : évite le fond sombre derrière la barre d'onglets. */
const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    primary: colors.primary,
    text: colors.text,
    border: colors.border,
  },
};

export default function RootLayout() {
  return (
    <PaperProvider theme={paperTheme}>
      <ThemeProvider value={navigationTheme}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "fade",
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </ThemeProvider>
    </PaperProvider>
  );
}
