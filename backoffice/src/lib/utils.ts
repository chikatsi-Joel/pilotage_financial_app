export function cn(...inputs: (string | false | null | undefined)[]): string {
  return inputs.filter(Boolean).join(" ");
}

const nf = new Intl.NumberFormat("fr-FR");
export const formatNumber = (n: number) => nf.format(n);

/** 0.124 → « +12 % » ; null → null. */
export function formatDelta(delta: number | null): string | null {
  if (delta === null) return null;
  const pct = Math.round(delta * 100);
  return `${pct > 0 ? "+" : ""}${pct} %`;
}

const dtf = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
export const formatDateTime = (iso: string) => dtf.format(new Date(iso));

const df = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
export const formatDay = (iso: string) => df.format(new Date(`${iso}T00:00:00`));
