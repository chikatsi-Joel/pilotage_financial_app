/** Logique pure des visites guidées (sans import : testée sous Node). */

/** Pages qui ont une visite. */
export const TOUR_SCREENS = ["dashboard", "analyse", "budget", "savings"] as const;
export type TourScreen = (typeof TOUR_SCREENS)[number];

/** Éléments pointables, par page (chacun est enregistré dans le code de la page). */
export const TOUR_TARGETS = {
  dashboard: ["balance", "income", "tab-analyse", "tab-budget", "tab-savings", "account"],
  analyse: ["expenses.analyse", "expenses.search", "expenses.add", "expenses.summary"],
  budget: ["budget.month", "budget.decision", "budget.add"],
  savings: ["savings.total", "savings.progress", "savings.add"],
} as const satisfies Record<TourScreen, readonly string[]>;
export type TourTarget = (typeof TOUR_TARGETS)[TourScreen][number];

export interface TourStep {
  target: TourTarget;
  title: string;
  text: string;
}

export const DEFAULT_TOURS: Record<TourScreen, TourStep[]> = {
  dashboard: [
    {
      target: "balance",
      title: "Votre solde du mois",
      text: "Revenus moins dépenses et épargne, mis à jour à chaque saisie. C'est ce qu'il vous reste vraiment.",
    },
    {
      target: "income",
      title: "Ajoutez vos revenus",
      text: "Salaire, prime, prêt… Enregistrez-les ici : Lucia s'en sert pour calculer votre solde et vos budgets.",
    },
    {
      target: "tab-analyse",
      title: "Vos dépenses",
      text: "Saisissez une dépense en quelques secondes, ou scannez votre ticket : Lucia la range dans la bonne catégorie.",
    },
    {
      target: "tab-budget",
      title: "Vos budgets",
      text: "Un plafond par catégorie. Lucia suit votre rythme et vous prévient avant que vous ne dépassiez.",
    },
    {
      target: "tab-savings",
      title: "Votre épargne",
      text: "Créez un objectif avec une échéance : vous voyez combien mettre de côté chaque mois.",
    },
    {
      target: "account",
      title: "Votre compte",
      text: "Réglez vos notifications et relancez les visites guidées quand vous voulez.",
    },
  ],
  analyse: [
    {
      target: "expenses.add",
      title: "Ajouter une dépense",
      text: "Montant, catégorie, date : c'est fait. Vous pouvez aussi photographier un ticket pour tout remplir d'un coup.",
    },
    {
      target: "expenses.summary",
      title: "Le mois en un coup d'œil",
      text: "Total dépensé et répartition par catégorie, recalculés à chaque nouvelle dépense.",
    },
    {
      target: "expenses.search",
      title: "Retrouver une transaction",
      text: "Tapez un mot de la note ou le nom d'une catégorie pour filtrer la liste.",
    },
    {
      target: "expenses.analyse",
      title: "L'analyse détaillée",
      text: "Tendances, saisonnalité et pistes d'économies calculées sur votre historique.",
    },
  ],
  budget: [
    {
      target: "budget.month",
      title: "Le mois suivi",
      text: "Les budgets se remettent à zéro chaque mois ; les montants affichés concernent ce mois-ci.",
    },
    {
      target: "budget.decision",
      title: "La recommandation de Lucia",
      text: "D'après vos habitudes, Lucia propose un budget réaliste. Validez-le en un geste ou ajustez-le.",
    },
    {
      target: "budget.add",
      title: "Vos catégories",
      text: "Ajoutez une catégorie et fixez-lui un plafond : Lucia vous alerte avant le dépassement.",
    },
  ],
  savings: [
    {
      target: "savings.total",
      title: "Votre épargne totale",
      text: "La somme de tous vos versements, et ce que vous avez mis de côté ce mois-ci.",
    },
    {
      target: "savings.progress",
      title: "Où vous en êtes",
      text: "La progression de l'ensemble de vos objectifs vers leur montant cible.",
    },
    {
      target: "savings.add",
      title: "Un nouvel objectif",
      text: "Nommez-le, fixez une cible et une échéance : Lucia calcule l'effort mensuel nécessaire.",
    },
  ],
};

/** Clé locale : dernière version de la visite de cette page vue sur cet appareil. */
export const tourSeenKey = (screen: TourScreen) => `lucia-tour-seen-version:${screen}`;

const isScreen = (v: string): v is TourScreen => (TOUR_SCREENS as readonly string[]).includes(v);

function parseScreenSteps(screen: TourScreen, data: unknown): TourStep[] {
  const defaults = DEFAULT_TOURS[screen];
  if (!Array.isArray(data)) return defaults;
  const allowed = TOUR_TARGETS[screen] as readonly string[];
  const steps: TourStep[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const { target, title, text } = item as Record<string, unknown>;
    if (typeof target !== "string" || !allowed.includes(target)) continue;
    if (steps.some((s) => s.target === target)) continue;
    const base = defaults.find((s) => s.target === target);
    const pick = (v: unknown, fallback: string, max: number) =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;
    const step = {
      target: target as TourTarget,
      title: pick(title, base?.title ?? "", 60),
      text: pick(text, base?.text ?? "", 220),
    };
    if (step.title && step.text) steps.push(step);
  }
  return steps.length ? steps : defaults;
}

/**
 * `tour_steps` (JSON de Remote Config) → visites par page.
 * Format : `{ "budget": [{ "target", "title", "text" }], … }` ; un tableau seul vaut pour l'accueil.
 * La liste d'une page fixe l'ordre et le sous-ensemble ; titre ou texte absent → texte intégré ;
 * cible inconnue ignorée ; page absente, vide ou JSON invalide → visite intégrée.
 */
export function parseTours(raw: string): Record<TourScreen, TourStep[]> {
  const tours = { ...DEFAULT_TOURS };
  if (!raw.trim()) return tours;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return tours;
  }
  if (Array.isArray(data)) {
    tours.dashboard = parseScreenSteps("dashboard", data);
    return tours;
  }
  if (!data || typeof data !== "object") return tours;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (isScreen(key)) tours[key] = parseScreenSteps(key, value);
  }
  return tours;
}

/** `tour_version` : entier ≥ 1 ; l'augmenter dans Remote Config remontre les visites à tout le monde. */
export function parseTourVersion(raw: string): number {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Visite à lancer automatiquement ? (jamais vue, ou version plus récente publiée). */
export function shouldAutoStartTour(enabled: boolean, version: number, seen: string | null): boolean {
  if (!enabled) return false;
  const seenVersion = seen ? Number.parseInt(seen, 10) : 0;
  return !Number.isFinite(seenVersion) || seenVersion < version;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** La cible est-elle entièrement visible ? (sinon l'étape est sautée plutôt que de pointer hors écran) */
export function isOnScreen(target: Rect, screen: { width: number; height: number }): boolean {
  return target.y >= 0 && target.x >= -1 && target.y + target.height <= screen.height && target.width > 0;
}

/**
 * Position de la bulle : sous la cible s'il y a la place, sinon au-dessus ; flèche alignée sur le
 * centre de la cible mais gardée dans la bulle (coins arrondis).
 */
export function placeBubble(
  target: Rect,
  screen: { width: number; height: number },
  bubble: { width: number; height: number },
  gap = 14,
): { top: number; left: number; arrowLeft: number; below: boolean } {
  const below = target.y + target.height + gap + bubble.height <= screen.height - 24;
  const top = below ? target.y + target.height + gap : Math.max(24, target.y - gap - bubble.height);
  const centerX = target.x + target.width / 2;
  const left = Math.min(Math.max(16, centerX - bubble.width / 2), screen.width - 16 - bubble.width);
  const arrowLeft = Math.min(Math.max(22, centerX - left), bubble.width - 22);
  return { top, left, arrowLeft, below };
}
