import { DefaultTheme, Stack, ThemeProvider, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, StyleSheet, View } from "react-native";
import { useFonts } from "expo-font";
// Import par graisse : seules ces 4 polices sont embarquées dans l'app.
import { Poppins_400Regular } from "@expo-google-fonts/poppins/400Regular";
import { Poppins_500Medium } from "@expo-google-fonts/poppins/500Medium";
import { Poppins_600SemiBold } from "@expo-google-fonts/poppins/600SemiBold";
import { Poppins_700Bold } from "@expo-google-fonts/poppins/700Bold";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { PaperProvider } from "react-native-paper";

import { setUnauthorizedHandler } from "../src/shared/auth/session";
import { initRemoteConfig } from "../src/shared/config/remoteConfig";
import { useRemoteFlags } from "../src/shared/config/remoteFlags";
import { endLocalSession } from "../src/shared/auth/signOut";
import { useNotificationRouting } from "../src/shared/notifications/useNotificationRouting";
import { useAppStore } from "../src/shared/store";
import { MaintenanceScreen } from "../src/ui/MaintenanceScreen";
import { TourProvider } from "../src/ui/tour/TourProvider";
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
  const signedIn = useAppStore((st) => st.userId !== null);
  const pathname = usePathname();
  const maintenance = useRemoteFlags((st) => st.maintenance);
  // Le point d'entrée « / » redirige : on attend qu'il ait fini avant d'ouvrir l'écran d'une notification.
  useNotificationRouting(signedIn && pathname !== "/" && pathname !== "/onboarding");
  // On attend les polices avant le premier rendu : un texte mesuré avec la police système puis
  // affiché en Poppins/Inter (plus larges) garde sa largeur et perd ses dernières lettres sur Android.
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Adresse du serveur venue de Firebase Remote Config, appliquée avant les premières requêtes.
  // Plafonné à 1,5 s : sans réponse, l'app démarre avec l'adresse actuelle.
  const [configReady, setConfigReady] = useState(false);
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        setConfigReady(true);
      }
    };
    const timer = setTimeout(finish, 1500);
    void initRemoteConfig().finally(finish);
    return () => clearTimeout(timer);
  }, []);

  // Maintenance : le bouton retour Android ne doit pas naviguer dans l'app masquée.
  useEffect(() => {
    if (!maintenance.enabled) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [maintenance.enabled]);

  useEffect(() => {
    // Session révoquée côté serveur : retour à l'écran de connexion.
    setUnauthorizedHandler(() => void endLocalSession());
    return () => setUnauthorizedHandler(null);
  }, []);

  if ((!fontsLoaded && !fontError) || !configReady) return null;

  return (
    <PaperProvider theme={paperTheme}>
      <ThemeProvider value={navigationTheme}>
        <TourProvider>
          {/* Pendant la maintenance, l'app en dessous est masquée aux lecteurs d'écran. */}
          <View
            accessibilityElementsHidden={maintenance.enabled}
            importantForAccessibility={maintenance.enabled ? "no-hide-descendants" : "auto"}
            style={styles.app}
          >
            <Stack
              screenOptions={{
                headerShown: false,
                animation: "fade",
                contentStyle: { backgroundColor: colors.background },
              }}
            />
          </View>
        </TourProvider>
        {/* Par-dessus la navigation (et non à sa place) : à la fin de la maintenance,
            l'utilisateur retrouve l'écran où il était. */}
        {maintenance.enabled ? (
          <View style={[StyleSheet.absoluteFill, styles.maintenance]}>
            <MaintenanceScreen message={maintenance.message} />
          </View>
        ) : null}
      </ThemeProvider>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  // Au-dessus de tout, y compris le voile de la visite guidée (elevation 30).
  maintenance: { elevation: 40, zIndex: 40 },
});
