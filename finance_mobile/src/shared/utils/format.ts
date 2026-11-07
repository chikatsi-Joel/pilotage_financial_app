/** 12.4 -> "+12%", -3.2 -> "3%" (le signe moins est porté par l'UI). */
export function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(Math.abs(value))}%`;
}

export const capitalize = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1);
