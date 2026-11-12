import { TurboModuleRegistry } from "react-native";

/**
 * Le module natif Firebase (`NativeRNFBTurbo<nom>`) est-il présent dans ce binaire ?
 * À tester AVANT tout `require("@react-native-firebase/…")` : sur un build qui ne contient pas
 * Firebase (APK actuel, Expo Go), le simple chargement du paquet affiche une erreur rouge
 * « Native module NativeRNFBTurboApp is not registered », même si l'appel est dans un try/catch.
 * `TurboModuleRegistry.get` renvoie null sans rien signaler.
 */
export function hasFirebaseNative(name: "Auth" | "Config"): boolean {
  try {
    return TurboModuleRegistry.get("NativeRNFBTurboApp") != null && TurboModuleRegistry.get(`NativeRNFBTurbo${name}`) != null;
  } catch {
    return false;
  }
}

/** Module natif de la connexion Google (même précaution que ci-dessus). */
export function hasGoogleSignInNative(): boolean {
  try {
    return TurboModuleRegistry.get("RNGoogleSignin") != null;
  } catch {
    return false;
  }
}
