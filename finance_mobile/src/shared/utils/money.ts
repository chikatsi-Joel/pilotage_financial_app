export function formatMoney(
  value: number | string | null | undefined,
  currency: string = "XAF"
): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (Number.isNaN(n)) return "0";
  const decimals = currency === "XAF" ? 0 : 2;
  const fixed = n.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const spaced = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const number = decPart ? `${spaced},${decPart}` : spaced;
  const suffix =
    currency === "XAF" ? "FCFA" : currency === "EUR" ? "€" : currency;
  return `${number} ${suffix}`;
}