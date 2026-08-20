export interface PaginatedResponse<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface User {
  id: string;
  name: string;
  currency: string;
}

export interface UserCreate {
  name: string;
  currency?: string;
}

export interface Income {
  id: string;
  amount: number;
  income_date: string;
  source: string;
  recurring: boolean;
}

export interface IncomeCreate {
  amount: number;
  income_date: string;
  source: string;
  recurring?: boolean;
}

export interface Category {
  id: string;
  name: string;
  category_type: "EXPENSE";
  essentiality: "ESSENTIAL" | "NON_ESSENTIAL";
  optimization_potential: "LOW" | "MEDIUM" | "HIGH";
  active: boolean;
}

export interface CategoryCreate {
  name: string;
  essentiality: Essentiality;
  optimization_potential: OptimizationPotential;
}

export interface CategoryUpdate {
  name?: string;
  essentiality?: Essentiality;
  optimization_potential?: OptimizationPotential;
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
  value: number;
  mae: number | null;
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

export interface Dashboard {
  period: string;
  income: number;
  expenses: number;
  savings: number;
  savings_rate: number;
  categories_in_drift: number;
  potential_savings: number;
  top_drift_categories: CategoryAnalytics[];
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

export interface WhatIfResult {
  period: string;
  category_name: string;
  current_amount: number;
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
  parse_error: string | null;
  number_warnings: string[] | null;
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
