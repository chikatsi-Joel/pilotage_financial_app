import { DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useEffect } from "react";
import { PaperProvider } from "react-native-paper";

import { setUnauthorizedHandler } from "../src/shared/auth/session";
import { endLocalSession } from "../src/shared/auth/signOut";
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
  useEffect(() => {
    // Session révoquée côté serveur : retour à l'écran de connexion.
    setUnauthorizedHandler(() => void endLocalSession());
    return () => setUnauthorizedHandler(null);
  }, []);

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
