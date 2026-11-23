import Constants from "expo-constants";
import { Linking } from "react-native";

import { apiOrigin } from "../api/baseUrl";

/**
 * Pages légales publiques servies par le serveur Lucia (/confidentialite, /suppression-compte).
 * `extra.legalBaseUrl` (app.config.js) fixe l'adresse publique définitive, celle déclarée dans
 * les fiches des stores ; à défaut, l'origine du serveur de l'app.
 */
function legalBase(): string {
  const base = (Constants.expoConfig?.extra as { legalBaseUrl?: string } | undefined)?.legalBaseUrl;
  return (typeof base === "string" && base.trim() ? base.trim() : apiOrigin()).replace(/\/+$/, "");
}

export const privacyUrl = () => `${legalBase()}/confidentialite`;
export const accountDeletionUrl = () => `${legalBase()}/suppression-compte`;

/** Contact (responsable du traitement, demandes Premium tant que le paiement n'est pas intégré). */
export const SUPPORT_EMAIL = "kappachikatsi@gmail.com";

/** Demande Premium par e-mail (en attendant le paiement intégré). */
export function requestPremium(): void {
  const subject = encodeURIComponent("Lucia — demande Premium");
  void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() => undefined);
}

export function openPrivacyPolicy(): void {
  void Linking.openURL(privacyUrl()).catch(() => undefined);
}
