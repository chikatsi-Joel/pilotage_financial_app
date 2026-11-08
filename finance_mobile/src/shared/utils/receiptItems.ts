import type { ExpenseCreate, ReceiptItem } from "../types";

/** Ligne d'achat en cours de validation (montant gardé en texte pour la saisie). */
export interface DraftLine {
  id: string;
  label: string;
  amount: string;
  categoryKey: string;
}

export interface CategoryOption {
  key: string;
  label: string;
}

/** Écart relatif au-delà duquel la somme des lignes est signalée au total du ticket. */
export const TOTAL_GAP_TOLERANCE = 0.01;

function parseLineAmount(raw: string): number {
  return Number(raw.replace(/\s/g, "").replace(",", "."));
}

/** Transforme les lignes lues par le scan en lignes éditables. */
export function toDraftLines(
  items: ReceiptItem[],
  categories: CategoryOption[],
  fallbackKey: string,
): DraftLine[] {
  return items.map((item, index) => {
    const match = item.category
      ? categories.find((c) => c.label.toLowerCase() === item.category!.toLowerCase())
      : undefined;
    return {
      id: `line-${index}`,
      label: item.label,
      amount: String(item.amount).replace(".", ","),
      categoryKey: match?.key ?? fallbackKey,
    };
  });
}

export function isLineValid(line: DraftLine): boolean {
  const amount = parseLineAmount(line.amount);
  return Number.isFinite(amount) && amount > 0 && line.categoryKey !== "";
}

export function validLines(lines: DraftLine[]): DraftLine[] {
  return lines.filter(isLineValid);
}

/** Somme des lignes valides, arrondie au centime. */
export function linesTotal(lines: DraftLine[]): number {
  const sum = validLines(lines).reduce((acc, l) => acc + parseLineAmount(l.amount), 0);
  return Math.round(sum * 100) / 100;
}

/** Écart absolu avec le total du ticket, ou null s'il est négligeable / inconnu. */
export function totalGap(sum: number, scanTotal: number | null): number | null {
  if (scanTotal == null || scanTotal <= 0) return null;
  const gap = Math.abs(sum - scanTotal);
  return gap / scanTotal > TOTAL_GAP_TOLERANCE ? Math.round(gap * 100) / 100 : null;
}

/** Charges à envoyer à l'API : une dépense par ligne valide. */
export function toExpensePayloads(lines: DraftLine[], date: string): ExpenseCreate[] {
  return validLines(lines).map((l) => ({
    amount: Math.round(parseLineAmount(l.amount) * 100) / 100,
    category_id: l.categoryKey,
    expense_date: date,
    note: l.label.trim() || null,
  }));
}
