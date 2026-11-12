import Constants from "expo-constants";

type AuthModule = typeof import("@react-native-firebase/auth");
type GoogleModule = typeof import("@react-native-google-signin/google-signin");

let authMod: AuthModule | null | undefined;
let googleMod: GoogleModule | null | undefined;

/**
 * Modules natifs chargés à la demande (même principe que les notifications) :
 * sur un build qui ne les contient pas encore, l'app ne plante pas, elle garde
 * l'ancienne connexion par email + mot de passe.
 */
function loadAuth(): AuthModule | null {
  if (authMod !== undefined) return authMod;
  try {
    authMod = require("@react-native-firebase/auth") as AuthModule;
    authMod.getAuth(); // échoue si le module natif est absent du binaire
  } catch (error) {
    console.warn("Firebase Auth indisponible dans ce build :", error);
    authMod = null;
  }
  return authMod;
}

/** ID client « Web » OAuth du projet Firebase (app.json → extra.googleWebClientId). */
function googleWebClientId(): string {
  const id = (Constants.expoConfig?.extra as { googleWebClientId?: string } | undefined)?.googleWebClientId;
  return typeof id === "string" ? id.trim() : "";
}

function loadGoogle(): GoogleModule | null {
  if (googleMod !== undefined) return googleMod;
  try {
    const mod = require("@react-native-google-signin/google-signin") as GoogleModule;
    mod.GoogleSignin.configure({ webClientId: googleWebClientId() });
    googleMod = mod;
  } catch (error) {
    console.warn("Connexion Google indisponible dans ce build :", error);
    googleMod = null;
  }
  return googleMod;
}

export function firebaseAvailable(): boolean {
  return loadAuth() !== null;
}

export function googleAvailable(): boolean {
  return firebaseAvailable() && googleWebClientId() !== "" && loadGoogle() !== null;
}

/** Erreur Firebase normalisée : `code` vaut par ex. « auth/invalid-credential ». */
export class FirebaseAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function wrap(error: unknown): FirebaseAuthError {
  const e = error as { code?: string; message?: string };
  return new FirebaseAuthError(e?.code ?? "auth/unknown", e?.message ?? "Erreur Firebase");
}

function requireAuth(): AuthModule {
  const mod = loadAuth();
  if (!mod) throw new FirebaseAuthError("auth/unavailable", "Firebase indisponible");
  return mod;
}

/** Connexion email + mot de passe ; renvoie l'ID token à échanger contre la session Lucia. */
export async function firebaseSignIn(email: string, password: string): Promise<string> {
  const mod = requireAuth();
  try {
    const cred = await mod.signInWithEmailAndPassword(mod.getAuth(), email, password);
    return await mod.getIdToken(cred.user);
  } catch (error) {
    throw wrap(error);
  }
}

export async function firebaseRegister(email: string, password: string): Promise<string> {
  const mod = requireAuth();
  try {
    const cred = await mod.createUserWithEmailAndPassword(mod.getAuth(), email, password);
    return await mod.getIdToken(cred.user);
  } catch (error) {
    throw wrap(error);
  }
}

/** Connexion Google ; `null` si l'utilisateur a fermé la fenêtre. */
export async function googleSignIn(): Promise<string | null> {
  const mod = requireAuth();
  const google = loadGoogle();
  if (!google) throw new FirebaseAuthError("auth/unavailable", "Google indisponible");
  try {
    await google.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await google.GoogleSignin.signIn();
    if (res.type !== "success") return null;
    if (!res.data.idToken) throw new FirebaseAuthError("auth/no-id-token", "Jeton Google manquant");
    const cred = await mod.signInWithCredential(
      mod.getAuth(),
      mod.GoogleAuthProvider.credential(res.data.idToken),
    );
    return await mod.getIdToken(cred.user);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === google.statusCodes.SIGN_IN_CANCELLED) return null;
    throw error instanceof FirebaseAuthError ? error : wrap(error);
  }
}

/** ID token frais de l'utilisateur Firebase connecté (le code email peut prendre du temps). */
export async function currentIdToken(): Promise<string | null> {
  const mod = loadAuth();
  const user = mod?.getAuth().currentUser;
  if (!mod || !user) return null;
  return mod.getIdToken(user);
}

/** Déconnecte Firebase et Google sur l'appareil (la session Lucia est gérée à part). */
export async function firebaseSignOut(): Promise<void> {
  const mod = loadAuth();
  try {
    if (mod?.getAuth().currentUser) await mod.signOut(mod.getAuth());
  } catch {
    // Déjà déconnecté.
  }
  if (googleWebClientId() !== "") {
    try {
      await loadGoogle()?.GoogleSignin.signOut();
    } catch {
      // Aucun compte Google sur l'appareil.
    }
  }
}
