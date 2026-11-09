export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface AuthFormInput {
  mode: "login" | "register" | "verify";
  name: string;
  email: string;
  password: string;
}

/** Message d'erreur du formulaire, ou null s'il est valide. */
export function validateAuthForm({ mode, name, email, password }: AuthFormInput): string | null {
  if (mode === "register" && name.trim().length === 0) return "Indiquez votre nom.";
  if (!EMAIL_RE.test(email.trim())) return "Adresse email invalide.";
  if (mode === "register" && password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  if (password.length === 0) return "Indiquez votre mot de passe.";
  return null;
}

/** Message lisible pour une erreur de l'API d'authentification. */
export function authErrorMessage(error: unknown): string {
  const err = error as { response?: { status?: number; data?: { detail?: unknown } } };
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail;
  if (status === undefined) {
    return "Serveur injoignable. Vérifiez votre connexion puis réessayez.";
  }
  if ([401, 403, 409, 429, 502].includes(status) && typeof detail === "string") return detail;
  if (status === 422) return "Informations invalides. Vérifiez l'email et le mot de passe.";
  return "Une erreur est survenue. Réessayez.";
}

export const CODE_LENGTH = 6;

/** Garde uniquement les chiffres, au plus CODE_LENGTH. */
export function sanitizeCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function isCodeComplete(code: string): boolean {
  return code.length === CODE_LENGTH;
}
