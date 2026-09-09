# Graph Report - pilotage_finances_backend  (2026-09-07)

## Corpus Check
- 103 files · ~141,324 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 861 nodes · 1726 edges · 66 communities (49 shown, 17 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 86 edges (avg confidence: 0.95)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d3f0e78c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- types/index.ts
- test_analytics.py
- paginate
- entities.py
- dependencies
- common.py
- what_if_service.py
- theme.ts
- budget_service.py
- savings_service.py
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
- expo
- expo-router
- @react-native-async-storage/async-storage
- expo-linking
- analytics_service.py
- savings-detail.tsx
- analyses.tsx
- budget.tsx
- dashboard.tsx
- components.tsx
- analyse-detail.tsx
- expo-router
- devDependencies
- scripts
- @expo/vector-icons
- l_quilibre_financier_2/DESIGN.md
- package.json
- l_quilibre_financier_1/DESIGN.md
- expo-constants
- expo-status-bar
- react
- react-native-paper
- @react-native-community/datetimepicker
- react-native-svg
- zustand
- add-expense.tsx
- budget-details.tsx
- simulation.tsx
- react-native-safe-area-context

## God Nodes (most connected - your core abstractions)
1. `money()` - 22 edges
2. `Category` - 21 edges
3. `paginate()` - 20 edges
4. `Expense` - 18 edges
5. `buildPath()` - 18 edges
6. `Base` - 17 edges
7. `expo-router` - 17 edges
8. `refresh_analytics()` - 16 edges
9. `Pilotage Finances - API Design Reference` - 16 edges
10. `colors` - 16 edges

## Surprising Connections (you probably didn't know these)
- `test_all_tables_build_on_sqlite_metadata()` --uses--> `Base`  [INFERRED]
  tests/test_schema.py → app/db/base.py
- `test_engine_analyze_sorts_by_opportunity_score()` --uses--> `CategoryType`  [INFERRED]
  tests/test_analytics.py → app/services/analytics/models.py
- `test_engine_skips_empty_categories()` --uses--> `CategoryType`  [INFERRED]
  tests/test_analytics.py → app/services/analytics/models.py
- `test_full_engine_analysis()` --uses--> `CategoryType`  [INFERRED]
  tests/test_analytics.py → app/services/analytics/models.py
- `test_engine_analyze_sorts_by_opportunity_score()` --uses--> `OptimizationPotential`  [INFERRED]
  tests/test_analytics.py → app/services/analytics/models.py

## Import Cycles
- None detected.

## Communities (66 total, 17 thin omitted)

### Community 0 - "types/index.ts"
Cohesion: 0.07
Nodes (53): ai, path(), analytics, path(), budget, path(), categories, path() (+45 more)

### Community 1 - "test_analytics.py"
Cohesion: 0.11
Nodes (52): FinancialAnalyticsEngine, Category, Expense, forecast(), predict(), score(), Category, CategoryAnalysis (+44 more)

### Community 2 - "paginate"
Cohesion: 0.12
Nodes (35): create_expense(), delete_expense(), list_expenses(), date, DbSession, ExpenseCreate, get, post (+27 more)

### Community 3 - "entities.py"
Cohesion: 0.07
Nodes (54): create_category(), list_categories(), CategoryCreate, CategoryUpdate, DbSession, ge, get, le (+46 more)

### Community 4 - "dependencies"
Cohesion: 0.15
Nodes (13): axios, dependencies, axios, react-dom, react-native, @react-native-community/slider, react-native-screens, react-native-vector-icons (+5 more)

### Community 5 - "common.py"
Cohesion: 0.06
Nodes (50): create_income(), list_incomes(), date, DbSession, ge, get, IncomeCreate, le (+42 more)

### Community 6 - "what_if_service.py"
Cohesion: 0.08
Nodes (31): get_user(), AsyncSession, User, UUID, DbSession, post, UserDep, what_if() (+23 more)

### Community 7 - "theme.ts"
Cohesion: 0.16
Nodes (6): icons, cpStyles, GOALS, styles, colors, paperTheme

### Community 8 - "budget_service.py"
Cohesion: 0.15
Nodes (31): decide_budget(), get_budget(), list_recommendations(), DbSession, get, post, put, RecommendationStatus (+23 more)

### Community 9 - "savings_service.py"
Cohesion: 0.09
Nodes (47): contribute(), create_goal(), list_goals(), DbSession, ge, get, le, post (+39 more)

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

### Community 41 - "analytics_service.py"
Cohesion: 0.17
Nodes (30): category_analytics(), dashboard(), DbSession, get, post, UserDep, refresh_analytics(), CategoryAnalyticsRead (+22 more)

### Community 42 - "savings-detail.tsx"
Cohesion: 0.27
Nodes (7): cap(), Contribution, eur(), MOCK, monthLabel(), SavingsDetail(), styles

### Community 43 - "analyses.tsx"
Cohesion: 0.09
Nodes (14): aiStyles, DRIFT_CATEGORIES, DriftCategory, driftStyles, IconName, Recommendation, RECOMMENDATIONS, recoStyles (+6 more)

### Community 44 - "budget.tsx"
Cohesion: 0.12
Nodes (13): AddCategoryModal(), AddCategoryModalProps, Budget(), CATEGORIES, Category, CategoryCard(), formatCurrency(), ICON_CHOICES (+5 more)

### Community 45 - "dashboard.tsx"
Cohesion: 0.11
Nodes (12): AlertItem, ALERTS, alertStyles, chartStyles, DONUT, donutStyles, legendStyles, SPARKLINE_DATA (+4 more)

### Community 46 - "components.tsx"
Cohesion: 0.15
Nodes (9): FILTERS, styles, TRANSACTIONS, styles, BrandMark(), Card(), Pill(), SectionTitle() (+1 more)

### Community 48 - "analyse-detail.tsx"
Cohesion: 0.18
Nodes (5): ActionItem, ACTIONS, Deviation, DEVIATIONS, styles

### Community 49 - "expo-router"
Cohesion: 0.29
Nodes (9): AddGoal(), computeMonthlyEstimate(), formatDateDisplay(), formatNumber(), MONTH_NAMES, styles, plugins, expo-router (+1 more)

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
Cohesion: 0.18
Nodes (7): DetailParams, MOCK, OPT_COEFFICIENT, OPT_LEVELS, OPT_META, OptLevel, styles

### Community 69 - "simulation.tsx"
Cohesion: 0.40
Nodes (5): formatEuro(), Scenario, SCENARIOS, Simulation(), styles

## Knowledge Gaps
- **208 isolated node(s):** `IconName`, `OptLevel`, `Category`, `CATEGORIES`, `RING` (+203 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `expo-router` connect `expo-router` to `index.tsx`, `add-expense.tsx`, `budget-details.tsx`, `simulation.tsx`, `theme.ts`, `savings-detail.tsx`, `stats-detail.tsx`, `analyses.tsx`, `budget.tsx`, `components.tsx`, `dashboard.tsx`, `analyse-detail.tsx`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `money()` connect `savings_service.py` to `budget_service.py`, `test_analytics.py`, `what_if_service.py`, `analytics_service.py`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `PaginatedResponse` connect `common.py` to `paginate`, `entities.py`, `routers/ai.py`, `budget_service.py`, `savings_service.py`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `Category` (e.g. with `FinancialAnalyticsEngine` and `compute_category_analytics()`) actually correct?**
  _`Category` has 12 INFERRED edges - model-reasoned connections that need verification._
- **What connects `IconName`, `OptLevel`, `Category` to the rest of the system?**
  _208 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `types/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07019230769230769 - nodes in this community are weakly interconnected._
- **Should `test_analytics.py` be split into smaller, more focused modules?**
  _Cohesion score 0.10576414595452142 - nodes in this community are weakly interconnected._