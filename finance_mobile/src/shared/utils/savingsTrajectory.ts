export interface ContributionPoint {
  amount: number;
  created_at: string;
}

export interface SavingsTrajectory {
  /** Points [instant ms, cumul] du réel, du premier versement à aujourd'hui. */
  real: Array<[number, number]>;
  start: number;
  today: number;
  deadline: number;
  /** Fin de l'axe horizontal. */
  end: number;
  current: number;
  target: number;
  reached: boolean;
  /** Moyenne versée par mois sur les 3 derniers mois (ou depuis le premier versement). */
  monthlyPace: number;
  /** Ce qu'il faudrait verser par mois pour tenir l'échéance ; null si atteint ou échéance passée. */
  neededPace: number | null;
  /** Date estimée d'atteinte de la cible au rythme actuel ; null si atteint ou rythme nul. */
  reachDate: number | null;
  /** Fin du trait « rythme actuel » [instant, montant] ; null si atteint ou rythme nul. */
  paceEnd: [number, number] | null;
  /** Montant prévu à l'échéance au rythme actuel ; null si atteint ou échéance passée. */
  projectedAtDeadline: number | null;
}

const DAY = 86_400_000;
const MONTH = 30.4375 * DAY;
const PACE_WINDOW = 3 * MONTH;

/**
 * Horodatage ISO du serveur → ms. Les microsecondes (« .981549 ») sont ramenées à 3 chiffres :
 * certains moteurs JS mobiles refusent plus de 3 décimales.
 */
export function parseInstant(iso: string): number {
  return new Date(iso.replace(/(\.\d{3})\d+/, "$1")).getTime();
}

/**
 * Trajectoire d'un objectif d'épargne à partir des vrais versements.
 *
 * - Réel : cumul des versements. Si le solde dépasse la somme des versements (montant de
 *   départ), l'écart est compté dès le début.
 * - Rythme actuel : total versé sur les 3 derniers mois, divisé par le nombre de mois d'historique
 * (arrondi, entre 1 et 3) pour ne pas exagérer un versement unique récent.
 * - Rythme nécessaire : reste à épargner divisé par les mois restants avant l'échéance.
 */
export function buildSavingsTrajectory({
  contributions,
  current,
  target,
  deadline,
  today,
}: {
  contributions: readonly ContributionPoint[];
  current: number;
  target: number;
  deadline: string;
  today: Date;
}): SavingsTrajectory {
  const now = today.getTime();
  const due = new Date(`${deadline.slice(0, 10)}T23:59:59`).getTime();

  const sorted = contributions
    .map((c) => ({ t: parseInstant(c.created_at), amount: c.amount }))
    .filter((c) => Number.isFinite(c.t) && c.t <= now)
    .sort((a, b) => a.t - b.t);

  const contributed = sorted.reduce((s, c) => s + c.amount, 0);
  const initial = Math.max(current - contributed, 0);
  /* Au moins un mois d'historique affiché, même pour un objectif tout neuf. */
  const start = Math.min(sorted.length ? sorted[0].t : now, now - MONTH);

  const real: Array<[number, number]> = [[start, initial]];
  let running = initial;
  for (const c of sorted) {
    running += c.amount;
    real.push([c.t, running]);
  }
  real.push([now, current]);

  const history = sorted.length ? (now - sorted[0].t) / MONTH : 0;
  const windowMonths = Math.min(PACE_WINDOW / MONTH, Math.max(1, Math.round(history)));
  const recent = sorted.filter((c) => c.t >= now - PACE_WINDOW).reduce((s, c) => s + c.amount, 0);
  const monthlyPace = recent / windowMonths;

  const reached = target > 0 && current >= target;
  const remainder = Math.max(target - current, 0);
  const monthsLeft = (due - now) / MONTH;
  const neededPace = !reached && monthsLeft > 0 ? remainder / Math.max(monthsLeft, 1 / 30) : null;
  const reachDate = !reached && monthlyPace > 0 ? now + (remainder / monthlyPace) * MONTH : null;

  const end = Math.max(due, now + MONTH);
  let paceEnd: [number, number] | null = null;
  if (reachDate !== null) {
    paceEnd = reachDate <= end ? [reachDate, target] : [end, current + monthlyPace * ((end - now) / MONTH)];
  }

  return {
    real,
    start,
    today: now,
    deadline: due,
    end,
    current,
    target,
    reached,
    monthlyPace,
    neededPace,
    reachDate,
    paceEnd,
    projectedAtDeadline:
      !reached && due > now ? current + monthlyPace * ((due - now) / MONTH) : null,
  };
}
