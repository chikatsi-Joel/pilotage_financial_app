export interface PaginatedResponse<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface User {
  id: string;
  name: string;
  currency: string;
  email?: string | null;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  currency?: string;
}

export interface PendingVerification {
  email: string;
  verification_required: boolean;
}

export interface VerifyPayload {
  email: string;
  code: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface FirebaseSignInPayload {
  id_token: string;
  name?: string;
  currency?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Income {
  id: string;
  amount: number;
  income_date: string;
  source: string;
  recurring: boolean;
  active: boolean;
}

export interface IncomeCreate {
  amount: number;
  income_date: string;
  source: string;
  recurring?: boolean;
}

export interface IncomeUpdate {
  amount?: number;
  income_date?: string;
  source?: string;
  recurring?: boolean;
  active?: boolean;
}

export interface Category {
  id: string;
  name: string;
  category_type: "EXPENSE";
  essentiality: "ESSENTIAL" | "NON_ESSENTIAL";
  optimization_potential: "LOW" | "MEDIUM" | "HIGH";
  monthly_budget: number | null;
  icon: string | null;
  color: string | null;
  active: boolean;
}

export interface CategoryCreate {
  name: string;
  essentiality: Essentiality;
  optimization_potential: OptimizationPotential;
  monthly_budget?: number | null;
  icon?: string | null;
  color?: string | null;
}

export interface CategoryUpdate {
  name?: string;
  essentiality?: Essentiality;
  optimization_potential?: OptimizationPotential;
  monthly_budget?: number | null;
  icon?: string | null;
  color?: string | null;
  active?: boolean;
}

export type Essentiality = "ESSENTIAL" | "NON_ESSENTIAL";
export type OptimizationPotential = "LOW" | "MEDIUM" | "HIGH";

export interface Expense {
  id: string;
  category_id: string;
  amount: number;
  expense_date: string;
  note: string | null;
}

export interface ExpenseCreate {
  amount: number;
  category_id: string;
  expense_date: string;
  note?: string | null;
}

export interface ReceiptItem {
  label: string;
  amount: number;
  category: string | null;
}

export interface ReceiptScan {
  items?: ReceiptItem[];
  amount: number | null;
  category: string | null;
  expense_date: string | null;
  merchant: string | null;
  description: string | null;
}

export interface SavingsContribution {
  id: string;
  amount: number;
  created_at: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  description: string | null;
  target_amount: number;
  deadline: string;
  active: boolean;
  current_amount: number;
  contributions: SavingsContribution[];
}

export interface SavingsGoalCreate {
  name: string;
  description?: string;
  target_amount: number;
  deadline: string;
}

export interface SavingsGoalUpdate {
  name?: string;
  description?: string | null;
  target_amount?: number;
  deadline?: string;
}

export interface SavingsGoalContribute {
  amount: number;
}

export interface SavingsGoalContributeRead {
  goal_id: string;
  goal_name: string;
  amount: number;
  new_total: number;
  target_amount: number;
  completed: boolean;
}

export interface Forecast {
  method: string;
  /** Espérance du mois prévu (probabilité d'utilisation incluse). */
  value: number;
  /** Erreur absolue moyenne hors échantillon. */
  mae: number | null;
  /** Fourchette à 80 % (bornes conformes), absente sous ~12 mois d'historique. */
  low?: number | null;
  high?: number | null;
  /** Part des mois où la catégorie est utilisée. */
  usage_rate?: number | null;
  /** Mois en cours : déjà dépensé + reste attendu au rythme habituel (+ bornes). */
  projection?: number | null;
  projection_low?: number | null;
  projection_high?: number | null;
}

export interface TimeSeriesProfile {
  level: number;
  trend: number;
  seasonality_strength: number;
  seasonality_reliable: boolean;
  volatility: number;
  anomaly_score: number;
  change_points: number[];
  drift_score: number;
  confidence: number;
  forecast: Forecast;
  history_months?: number | null;
  last_change?: number | null;
}

export interface CategoryAnalytics {
  category_id: string;
  name: string;
  description: string;
  period: string;
  essential: boolean;
  current_amount: number;
  baseline_amount: number;
  expected_amount: number;
  variation_percentage: number;
  potential_saving: number;
  opportunity_score: number;
  profile: TimeSeriesProfile;
}

export interface WeeklyExpense {
  label: string;
  prevu: number;
  reel: number;
}

export interface SavingsGoalSummary {
  name: string;
  target_amount: number;
  current_amount: number;
  progress_percentage: number;
}

export interface Dashboard {
  period: string;
  income: number;
  expenses: number;
  savings: number;
  remaining_balance: number;
  contributions: number;
  savings_rate: number;
  categories_in_drift: number;
  potential_savings: number;
  top_drift_categories: CategoryAnalytics[];
  weekly: WeeklyExpense[];
  sparkline: number[];
  monthly_variation: number | null;
  savings_goal: SavingsGoalSummary | null;
}

export interface BudgetCategoryLine {
  category_id: string;
  category_name: string;
  current: number;
  baseline: number;
  recommended: number;
  essential: boolean;
  reduction: number;
  reason: string;
}

export interface Budget {
  period: string;
  projected_income: number;
  current_expenses: number;
  recommended_expenses: number;
  current_savings: number;
  recommended_savings: number;
  target_savings: number | null;
  potential_savings: number;
  target_gap: number;
  categories: BudgetCategoryLine[];
  rationale: string;
}

/** Persisted budget returned by GET /budget and PUT /budget/decision. */
export interface BudgetSummary {
  period: string;
  recommended_total: number;
  recommended_savings: number;
  accepted_total: number | null;
  accepted_savings: number | null;
  rationale: string;
}

export interface BudgetDecision {
  accepted_total: number;
  accepted_savings: number;
}

export interface AnalyticsRefreshResult {
  period: string;
  snapshot: {
    income: number;
    expenses: number;
    savings: number;
    savings_rate: number;
  };
  categories: number;
}

export interface Recommendation {
  id: string;
  category_id: string;
  category_name: string;
  period: string;
  impact_estimated: number;
  justification: string;
  status: RecommendationStatus;
}

export type RecommendationStatus =
  | "PROPOSED"
  | "ACCEPTED"
  | "REJECTED"
  | "ADJUSTED";

export interface WhatIfRequest {
  category_id: string;
  reduction_percent: number;
}

export interface MonthlyTotal {
  period: string;
  /** Dépenses du mois. */
  total: number;
  income: number;
  /** Revenus − dépenses. */
  savings: number;
}

export interface WhatIfResult {
  period: string;
  category_name: string;
  current_amount: number;
  /** Montant mensuel auquel la réduction s'applique. */
  reference_amount: number;
  /** "habituel" = moyenne des mois précédents, "mois_en_cours" = dépenses du mois. */
  reference_basis: "habituel" | "mois_en_cours";
  reduction_percent: number;
  new_target: number;
  monthly_saving: number;
  annual_saving: number;
  projected_savings_rate: number | null;
}

export interface AIAnalysis {
  period: string;
  summary: string;
  alerts: Record<string, unknown>[];
  recommendations: Record<string, unknown>[];
  projected_impact: Record<string, unknown>;
  fallback: boolean;
  /** Analyse enregistrée resservie (données inchangées). */
  cached?: boolean;
  /** Relance forcée trop rapprochée : secondes avant la prochaine possible. */
  retry_after?: number | null;
  parse_error: string | null;
  number_warnings: string[] | null;
  /** Freemium : quota du mois épuisé pour une nouvelle analyse (dernière resservie, ou vide). */
  quota_exceeded?: boolean;
  /** Même analyse déjà en préparation (autre écran) : rien n'est consommé. */
  pending?: boolean;
  /** Dernière analyse resservie alors que les données ont changé depuis (compte gratuit). */
  stale?: boolean;
  /** Date de l'analyse resservie (ISO). */
  analyzed_at?: string | null;
  quota?: AIQuota | null;
}

/** Quota d'analyses IA du mois. `limit`/`remaining` null : illimité (freemium coupé, premium). */
export interface AIQuota {
  enabled: boolean;
  premium: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  /** Début du mois suivant (ISO), quand le quota revient. */
  resets_at: string;
}

/** Explication IA d'une catégorie de dépenses pour un mois. */
export interface CategoryExplanation {
  period: string;
  category_id: string;
  summary: string;
  points: string[];
  cached: boolean;
  /** Modèle injoignable : explication chiffrée sans IA. */
  fallback: boolean;
  error: string | null;
  quota_exceeded: boolean;
  pending: boolean;
  stale: boolean;
  analyzed_at: string | null;
  number_warnings: string[] | null;
  quota: AIQuota;
}

/** État Premium du compte (abonnement Google Play ou activation manuelle). */
export interface BillingStatus {
  premium: boolean;
  premium_until: string | null;
  /** À transmettre à Google Play (obfuscatedAccountId) au lancement d'un achat. */
  account_tag: string;
  product_id: string;
  subscription: {
    product_id: string;
    base_plan_id: string | null;
    state: string;
    expires_at: string | null;
    auto_renewing: boolean;
  } | null;
}

export interface AIAnalysisStored {
  id: string;
  period: string;
  model: string;
  summary: string;
  alerts: Record<string, unknown>[];
  recommendations: Record<string, unknown>[];
  projected_impact: Record<string, unknown>;
  fallback: boolean;
}

export interface AIHealth {
  status: string;
  ollama_url: string;
  configured_model: string;
}

export interface NotificationPreferences {
  budget_alerts: boolean;
  savings_milestones: boolean;
  daily_reminder: boolean;
  daily_reminder_hour: number;
  weekly_summary: boolean;
  ai_insights: boolean;
  timezone: string;
}
