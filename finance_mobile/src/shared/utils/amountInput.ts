export type NumpadKey =
  | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "," | "0" | "del";

export const NUMPAD_KEYS: readonly NumpadKey[] = [
  "1", "2", "3",
  "4", "5", "6",
  "7", "8", "9",
  ",", "0", "del",
];

/** Saisie clavier numérique : max 2 décimales, pas de "0" superflu. */
export function updateAmountInput(
  prev: string,
  key: NumpadKey,
  maxDigits: number,
): string {
  if (key === "del") return prev.length > 1 ? prev.slice(0, -1) : "0";
  if (key === ",") return prev.includes(",") ? prev : prev + ",";
  const decimals = prev.split(",")[1];
  if (decimals && decimals.length >= 2) return prev;
  if (prev.replace(/[^\d]/g, "").length >= maxDigits) return prev;
  return prev === "0" ? key : prev + key;
}

/** Affichage du montant en cours de saisie : « 1250000,5 » -> « 1 250 000,5 ». */
export function groupAmountInput(raw: string): string {
  const sep = raw.includes(",") ? "," : raw.includes(".") ? "." : null;
  const [int, dec] = sep ? raw.split(sep) : [raw, undefined];
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  return dec === undefined ? grouped : `${grouped},${dec}`;
}

/** "1 250,50" saisi au clavier -> 1250.5. */
export function parseAmount(raw: string): number {
  return Number(raw.replace(",", "."));
}
