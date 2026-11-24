/**
 * Devises proposées à l'utilisateur (affichage seulement : les montants ne sont jamais
 * convertis). La devise par défaut à l'inscription suit la région du téléphone.
 */

export interface CurrencyInfo {
  code: string;
  label: string;
  symbol: string;
  decimals: number;
  /** Régions (ISO 3166) où c'est la devise courante : choix par défaut à l'inscription. */
  regions: readonly string[];
}

export const CURRENCIES: readonly CurrencyInfo[] = [
  { code: "XAF", label: "Franc CFA (CEMAC)", symbol: "FCFA", decimals: 0, regions: ["CM", "GA", "CG", "TD", "CF", "GQ"] },
  { code: "XOF", label: "Franc CFA (UEMOA)", symbol: "FCFA", decimals: 0, regions: ["SN", "CI", "BJ", "BF", "ML", "NE", "TG", "GW"] },
  { code: "EUR", label: "Euro", symbol: "€", decimals: 2, regions: ["FR", "BE", "DE", "ES", "IT", "PT", "LU", "NL", "IE", "AT", "FI", "GR"] },
  { code: "USD", label: "Dollar américain", symbol: "$", decimals: 2, regions: ["US"] },
  { code: "GBP", label: "Livre sterling", symbol: "£", decimals: 2, regions: ["GB"] },
  { code: "CAD", label: "Dollar canadien", symbol: "$ CA", decimals: 2, regions: ["CA"] },
  { code: "CHF", label: "Franc suisse", symbol: "CHF", decimals: 2, regions: ["CH"] },
  { code: "MAD", label: "Dirham marocain", symbol: "MAD", decimals: 2, regions: ["MA"] },
  { code: "NGN", label: "Naira", symbol: "₦", decimals: 2, regions: ["NG"] },
  { code: "GHS", label: "Cedi", symbol: "GH₵", decimals: 2, regions: ["GH"] },
  { code: "KES", label: "Shilling kényan", symbol: "KSh", decimals: 2, regions: ["KE"] },
  { code: "CDF", label: "Franc congolais", symbol: "FC", decimals: 2, regions: ["CD"] },
  { code: "GNF", label: "Franc guinéen", symbol: "FG", decimals: 0, regions: ["GN"] },
  { code: "RWF", label: "Franc rwandais", symbol: "FRw", decimals: 0, regions: ["RW"] },
];

export const DEFAULT_CURRENCY = "XAF";

/** Infos d'une devise ; code inconnu (ancien compte) : le code lui-même, 2 décimales. */
export function currencyInfo(code: string): CurrencyInfo {
  return (
    CURRENCIES.find((c) => c.code === code) ?? {
      code,
      label: code,
      symbol: code,
      decimals: 2,
      regions: [],
    }
  );
}

export function currencySymbol(code: string): string {
  return currencyInfo(code).symbol;
}

/** Devise de la région du téléphone (ex. « fr-SN » -> XOF), sinon XAF. */
export function deviceCurrency(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale.split(/[-_]/).find((part, i) => i > 0 && /^[A-Z]{2}$/.test(part));
    const match = region ? CURRENCIES.find((c) => c.regions.includes(region)) : undefined;
    return match?.code ?? DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}
