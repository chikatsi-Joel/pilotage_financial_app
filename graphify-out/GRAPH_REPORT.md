# Graph Report - pilotage_finances_backend  (2026-09-05)

## Corpus Check
- 103 files · ~138,985 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 851 nodes · 1610 edges · 81 communities (50 shown, 31 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 86 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `83bbb499`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- types/index.ts
- test_analytics.py
- expenses.py
- entities.py
- dependencies
- savings_service.py
- what_if_service.py
- theme.ts
- analytics_service.py
- common.py
- stats-detail.tsx
- Décisions d'implémentation
- expo
- api-client.test.cjs
- tsconfig.json
- graphify.js
- utils/__init__.py
- pilotage-finances-backend
- Pilotage Finances Personnelles — Backend FastAPI
- Pilotage Finances - API Design Reference
- opencode.json
- AGENTS.md
- index.tsx
- Finance mobile
- routers/ai.py
- expo-linking
- expo-router
- @react-native-async-storage/async-storage
- users.py
- react-native-vector-icons
- env.py
- analyse.tsx
- budget.tsx
- dashboard.tsx
- components.tsx
- paginate
- analyse-detail.tsx
- add-goal.tsx
- devDependencies
- scripts
- axios
- l_quilibre_financier_2/DESIGN.md
- package.json
- l_quilibre_financier_1/DESIGN.md
- DbSession
- expo-constants
- expo-status-bar
- react
- get
- react-native-paper
- post
- react-native-screens
- react-native-svg
- UserDep
- zustand
- add-expense.tsx
- budget-details.tsx
- simulation.tsx
- Category
- Decimal
- Expense
- Category
- CategoryCreate
- CategoryUpdate
- Expense
- ExpenseCreate
- IncomeCreate
- CategoryAnalytics
- Income

## God Nodes (most connected - your core abstractions)
1. `money()` - 20 edges
2. `buildPath()` - 18 edges
3. `paginate()` - 17 edges
4. `expo-router` - 17 edges
5. `Pilotage Finances - API Design Reference` - 16 edges
6. `colors` - 16 edges
7. `month_bounds()` - 15 edges
8. `refresh_analytics()` - 14 edges
9. `PaginatedResponse` - 14 edges
10. `compute_category_analytics()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `test_money_rounds()` --calls--> `money()`  [INFERRED]
  tests/test_analytics.py → app/services/analytics/engine.py
- `test_profile_to_dict_roundtrip()` --calls--> `_profile_to_dict()`  [EXTRACTED]
  tests/test_analytics.py → app/services/analytics_service.py
- `test_robust_baseline_filters_outlier()` --calls--> `robust_baseline()`  [INFERRED]
  tests/test_analytics.py → app/services/analytics/statistics.py
- `test_mad_filters_outlier()` --calls--> `mad()`  [INFERRED]
  tests/test_analytics.py → app/services/analytics/statistics.py
- `test_robust_relative_dispersion()` --calls--> `robust_relative_dispersion()`  [INFERRED]
  tests/test_analytics.py → app/services/analytics/statistics.py

## Import Cycles
- None detected.

## Communities (81 total, 31 thin omitted)

### Community 0 - "types/index.ts"
Cohesion: 0.07
Nodes (53): ai, path(), analytics, path(), budget, path(), categories, path() (+45 more)

### Community 1 - "test_analytics.py"
Cohesion: 0.10
Nodes (51): FinancialAnalyticsEngine, Category, Expense, forecast(), predict(), score(), Category, CategoryAnalysis (+43 more)

### Community 2 - "expenses.py"
Cohesion: 0.18
Nodes (25): create_expense(), delete_expense(), list_expenses(), date, DbSession, ExpenseCreate, get, post (+17 more)

### Community 3 - "entities.py"
Cohesion: 0.10
Nodes (43): create_category(), list_categories(), CategoryCreate, CategoryUpdate, DbSession, ge, get, le (+35 more)

### Community 4 - "dependencies"
Cohesion: 0.15
Nodes (13): expo, dependencies, expo, react-native, @react-native-community/datetimepicker, @react-native-community/slider, react-native-safe-area-context, @react-navigation/native (+5 more)

### Community 5 - "savings_service.py"
Cohesion: 0.09
Nodes (48): contribute(), create_goal(), list_goals(), DbSession, ge, get, le, post (+40 more)

### Community 6 - "what_if_service.py"
Cohesion: 0.08
Nodes (31): get_user(), AsyncSession, User, UUID, DbSession, post, UserDep, what_if() (+23 more)

### Community 7 - "theme.ts"
Cohesion: 0.14
Nodes (10): plugins, QUICK_WINS, styles, icons, cpStyles, GOALS, styles, colors (+2 more)

### Community 8 - "analytics_service.py"
Cohesion: 0.14
Nodes (34): category_analytics(), dashboard(), refresh_analytics(), CategoryAnalytics, ForecastRead, TimeSeriesProfileRead, compute_category_analytics(), get_category_analytics_snapshot() (+26 more)

### Community 9 - "common.py"
Cohesion: 0.09
Nodes (47): decide_budget(), get_budget(), list_recommendations(), DbSession, get, post, put, RecommendationStatus (+39 more)

### Community 10 - "stats-detail.tsx"
Cohesion: 0.06
Nodes (25): acStyles, CATEGORIES, CategoryBars(), cbStyles, dnStyles, DonutChart(), EXPENSES, fcStyles (+17 more)

### Community 11 - "Décisions d'implémentation"
Cohesion: 0.20
Nodes (9): Analyse IA (Ollama / Gemma), Baseline, Budget, Décisions d'implémentation, Déviation, Exceptions, Potentiel d'optimisation, Tendance (+1 more)

### Community 12 - "expo"
Cohesion: 0.09
Nodes (22): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, predictiveBackGestureEnabled, expo (+14 more)

### Community 13 - "api-client.test.cjs"
Cohesion: 0.22
Nodes (7): assert, { buildPath }, fs, Module, path, test, ts

### Community 14 - "tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, strict, extends, expo/tsconfig.base

### Community 29 - "Pilotage Finances Personnelles — Backend FastAPI"
Cohesion: 0.25
Nodes (7): Architecture, Docker complet, Démarrage rapide, Pilotage Finances Personnelles — Backend FastAPI, Point de sécurité important, Périmètre implémenté, Tests

### Community 30 - "Pilotage Finances - API Design Reference"
Cohesion: 0.12
Nodes (16): 10. Épargne, 11. Analyse IA, 1. Profil Utilisateur, 2. Données de base (Catégories), 3. Revenus, 4. Dépenses, 5. Dashboard (Accueil), 6. Analyse par catégorie (+8 more)

### Community 31 - "opencode.json"
Cohesion: 0.50
Nodes (3): plugin, $schema, .opencode/plugins/graphify.js

### Community 33 - "index.tsx"
Cohesion: 0.53
Nodes (4): Index(), AppState, currentMonth(), useAppStore

### Community 34 - "Finance mobile"
Cohesion: 0.50
Nodes (3): Configuration locale, Finance mobile, Vérification

### Community 36 - "routers/ai.py"
Cohesion: 0.07
Nodes (41): ai_health(), AIAnalysisResponse, AIAnalysisStoredRead, analyze_period(), get_ai_provider(), list_analyses(), BaseModel, DbSession (+33 more)

### Community 40 - "users.py"
Cohesion: 0.18
Nodes (15): create_user(), get_users(), AsyncSession, DbSession, get, post, UserCreate, UserDep (+7 more)

### Community 42 - "env.py"
Cohesion: 0.25
Nodes (6): Base, Connection, DeclarativeBase, do_run_migrations(), run_migrations_online(), test_all_tables_build_on_sqlite_metadata()

### Community 43 - "analyse.tsx"
Cohesion: 0.09
Nodes (14): aiStyles, DRIFT_CATEGORIES, DriftCategory, driftStyles, IconName, Recommendation, RECOMMENDATIONS, recoStyles (+6 more)

### Community 44 - "budget.tsx"
Cohesion: 0.22
Nodes (8): Budget(), CATEGORIES, Category, CategoryCard(), formatCurrency(), IconName, TODO: Navigation détail catégorie, styles

### Community 45 - "dashboard.tsx"
Cohesion: 0.11
Nodes (12): AlertItem, ALERTS, alertStyles, chartStyles, DONUT, donutStyles, legendStyles, SPARKLINE_DATA (+4 more)

### Community 46 - "components.tsx"
Cohesion: 0.15
Nodes (9): FILTERS, styles, TRANSACTIONS, styles, BrandMark(), Card(), Pill(), SectionTitle() (+1 more)

### Community 47 - "paginate"
Cohesion: 0.09
Nodes (27): create_income(), list_incomes(), date, DbSession, ge, get, IncomeCreate, le (+19 more)

### Community 48 - "analyse-detail.tsx"
Cohesion: 0.18
Nodes (5): ActionItem, ACTIONS, Deviation, DEVIATIONS, styles

### Community 49 - "add-goal.tsx"
Cohesion: 0.43
Nodes (6): AddGoal(), computeMonthlyEstimate(), formatDateDisplay(), formatNumber(), MONTH_NAMES, styles

### Community 50 - "devDependencies"
Cohesion: 0.29
Nodes (7): devDependencies, @types/react, @types/react-native-vector-icons, typescript, @types/react, @types/react-native-vector-icons, typescript

### Community 51 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, android, ios, start, test, typecheck, web

### Community 53 - "l_quilibre_financier_2/DESIGN.md"
Cohesion: 0.18
Nodes (10): Brand & Style, Buttons & Controls, Colors, Components, Data Indicators, Elevation & Depth, Layout & Spacing, Shapes (+2 more)

### Community 54 - "package.json"
Cohesion: 0.40
Nodes (4): main, name, private, version

### Community 55 - "l_quilibre_financier_1/DESIGN.md"
Cohesion: 0.25
Nodes (7): Brand & Style, Colors, Components, Elevation & Depth, Layout & Spacing, Shapes, Typography

### Community 67 - "add-expense.tsx"
Cohesion: 0.29
Nodes (5): AddExpense(), CATEGORIES, Category, NUMPAD, styles

### Community 68 - "budget-details.tsx"
Cohesion: 0.29
Nodes (3): DetailParams, MOCK, styles

### Community 69 - "simulation.tsx"
Cohesion: 0.40
Nodes (5): formatEuro(), Scenario, SCENARIOS, Simulation(), styles

## Knowledge Gaps
- **197 isolated node(s):** `PathParameters`, `BudgetCategoryLine`, `Essentiality`, `Forecast`, `OptimizationPotential` (+192 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `money()` connect `savings_service.py` to `analytics_service.py`, `test_analytics.py`, `common.py`, `what_if_service.py`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `expo-router` connect `theme.ts` to `index.tsx`, `add-expense.tsx`, `budget-details.tsx`, `simulation.tsx`, `stats-detail.tsx`, `analyse.tsx`, `budget.tsx`, `dashboard.tsx`, `components.tsx`, `analyse-detail.tsx`, `add-goal.tsx`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `PaginatedResponse` connect `common.py` to `expenses.py`, `entities.py`, `routers/ai.py`, `savings_service.py`, `paginate`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `money()` (e.g. with `get_dashboard()` and `get_dashboard_snapshot()`) actually correct?**
  _`money()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `PathParameters`, `BudgetCategoryLine`, `Essentiality` to the rest of the system?**
  _197 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `types/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07019230769230769 - nodes in this community are weakly interconnected._
- **Should `test_analytics.py` be split into smaller, more focused modules?**
  _Cohesion score 0.09562841530054644 - nodes in this community are weakly interconnected._