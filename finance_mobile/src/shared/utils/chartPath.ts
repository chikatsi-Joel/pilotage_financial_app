export type Pt = [number, number];

/**
 * Tracé SVG lissé qui passe par chaque point sans dépasser (interpolation cubique monotone,
 * Fritsch–Carlson) : pas de bosse fantôme entre deux mois, contrairement à une spline classique.
 */
export function monotonePath(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return "";
  const f = (v: number) => v.toFixed(1);
  if (n === 1) return `M${f(pts[0][0])},${f(pts[0][1])}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    slope.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1));
  }
  const tan: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    tan.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tan.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tan[i] = 0;
      tan[i + 1] = 0;
      continue;
    }
    const a = tan[i] / slope[i];
    const b = tan[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const s = 3 / Math.sqrt(h);
      tan[i] = s * a * slope[i];
      tan[i + 1] = s * b * slope[i];
    }
  }

  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += ` C${f(x0 + h)},${f(y0 + tan[i] * h)} ${f(x1 - h)},${f(y1 - tan[i + 1] * h)} ${f(x1)},${f(y1)}`;
  }
  return d;
}

/** Moyenne mobile sur `window` valeurs ; null tant que la fenêtre n'est pas pleine. */
export function movingAverage(values: number[], window: number): Array<number | null> {
  return values.map((_, i) =>
    i + 1 < window ? null : values.slice(i + 1 - window, i + 1).reduce((s, v) => s + v, 0) / window,
  );
}

/** Graduation « ronde » au-dessus de `max` : 1, 2, 2,5 ou 5 × 10^k. */
export function niceCeil(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}
