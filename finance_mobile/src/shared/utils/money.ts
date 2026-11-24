import { currencyInfo } from "../config/currencies";

/** « 12 500 FCFA », « 1 234,50 € » : séparateur de milliers espace, décimales selon la devise. */
export function formatMoney(
  value: number | string | null | undefined,
  currency: string = "XAF"
): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (Number.isNaN(n)) return "0";
  const { decimals, symbol } = currencyInfo(currency);
  const fixed = n.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const spaced = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const number = decPart ? `${spaced},${decPart}` : spaced;
  return `${number} ${symbol}`;
}
