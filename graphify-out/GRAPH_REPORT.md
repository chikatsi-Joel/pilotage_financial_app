# Graph Report - pilotage_finances_backend  (2026-08-25)

## Corpus Check
- 102 files · ~138,246 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 810 nodes · 1512 edges · 70 communities (45 shown, 25 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 58 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4d669cb8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- types/index.ts
- test_analytics.py
- common.py
- entities.py
- dependencies
- savings_service.py
- deps.py
- theme.ts
- analytics_service.py
- money
- stats-detail.tsx
- Expense
- expo
- api-client.test.cjs
- tsconfig.json
- graphify.js
- utils/__init__.py
- pilotage-finances-backend
- category_service.py
- Pilotage Finances - API Design Reference
- opencode.json
- AGENTS.md
- RecommendationStatus
- RecommendationStatus
- Category
- paginate
- SavingsGoal
- BaseModel
- CategoryCreate
- CategoryUpdate
- put
- SavingsGoalCreate
- analyse.tsx
- budget.tsx
- dashboard.tsx
- components.tsx
- simulate
- analyse-detail.tsx
- add-goal.tsx
- devDependencies
- scripts
- savings.tsx
- l_quilibre_financier_2/DESIGN.md
- package.json
- l_quilibre_financier_1/DESIGN.md
- axios
- expo-constants
- expo-status-bar
- react
- react-native
- react-native-paper
- react-native-safe-area-context
- react-native-screens
- react-native-svg
- @react-navigation/native
- zustand
- add-expense.tsx
- budget-details.tsx
- simulation.tsx

## God Nodes (most connected - your core abstractions)
1. `paginate()` - 20 edges
2. `buildPath()` - 18 edges
3. `money()` - 18 edges
4. `Base` - 17 edges
5. `Pilotage Finances - API Design Reference` - 16 edges
6. `colors` - 16 edges
7. `FinancialAnalyticsEngine` - 15 edges
8. `compute_category_analytics()` - 15 edges
9. `Expense` - 13 edges
10. `mad()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `test_all_tables_build_on_sqlite_metadata()` --uses--> `Base`  [INFERRED]
  tests/test_schema.py → app/db/base.py
- `create()` --calls--> `Category`  [EXTRACTED]
  app/services/category_service.py → finance_mobile/src/shared/types/index.ts
- `create()` --calls--> `Expense`  [EXTRACTED]
  app/services/expense_service.py → finance_mobile/src/shared/types/index.ts
- `create_goal()` --calls--> `SavingsGoal`  [EXTRACTED]
  app/services/savings_service.py → finance_mobile/src/shared/types/index.ts
- `test_engine_analyze_sorts_by_opportunity_score()` --uses--> `CategoryType`  [INFERRED]
  tests/test_analytics.py → app/services/analytics/models.py

## Import Cycles
- None detected.

## Communities (70 total, 25 thin omitted)

### Community 0 - "types/index.ts"
Cohesion: 0.07
Nodes (53): ai, path(), analytics, path(), budget, path(), categories, path() (+45 more)

### Community 1 - "test_analytics.py"
Cohesion: 0.06
Nodes (79): Any, AIAnalysisProvider, _build_prompt(), _extract_known_numbers(), _fallback_analysis(), OllamaProvider, _parse_response(), Extract all known numeric values from the input context. (+71 more)

### Community 2 - "common.py"
Cohesion: 0.11
Nodes (38): create_expense(), delete_expense(), list_expenses(), date, DbSession, ExpenseCreate, get, post (+30 more)

### Community 3 - "entities.py"
Cohesion: 0.14
Nodes (25): Base, AIAnalysis, Budget, Category, CategoryAnalytics, CategoryType, ConfidenceLevel, DriftSignal (+17 more)

### Community 4 - "dependencies"
Cohesion: 0.15
Nodes (13): expo, expo-linking, dependencies, expo, expo-linking, @react-native-async-storage/async-storage, @react-native-community/datetimepicker, @react-native-community/slider (+5 more)

### Community 5 - "savings_service.py"
Cohesion: 0.09
Nodes (44): contribute(), create_goal(), list_goals(), DbSession, ge, get, le, post (+36 more)

### Community 6 - "deps.py"
Cohesion: 0.08
Nodes (31): get_user(), AsyncSession, User, UUID, create_user(), get_users(), AsyncSession, DbSession (+23 more)

### Community 7 - "theme.ts"
Cohesion: 0.21
Nodes (5): QUICK_WINS, styles, icons, colors, paperTheme

### Community 8 - "analytics_service.py"
Cohesion: 0.19
Nodes (25): category_analytics(), dashboard(), DbSession, get, post, UserDep, refresh_analytics(), CategoryAnalyticsRead (+17 more)

### Community 9 - "money"
Cohesion: 0.14
Nodes (33): decide_budget(), get_budget(), list_recommendations(), DbSession, get, post, put, UserDep (+25 more)

### Community 10 - "stats-detail.tsx"
Cohesion: 0.06
Nodes (25): acStyles, CATEGORIES, CategoryBars(), cbStyles, dnStyles, DonutChart(), EXPENSES, fcStyles (+17 more)

### Community 12 - "expo"
Cohesion: 0.07
Nodes (29): expo-router, backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, predictiveBackGestureEnabled (+21 more)

### Community 13 - "api-client.test.cjs"
Cohesion: 0.22
Nodes (7): assert, { buildPath }, fs, Module, path, test, ts

### Community 14 - "tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, strict, extends, expo/tsconfig.base

### Community 29 - "category_service.py"
Cohesion: 0.12
Nodes (26): create_category(), list_categories(), DbSession, ge, get, le, post, Query (+18 more)

### Community 30 - "Pilotage Finances - API Design Reference"
Cohesion: 0.12
Nodes (16): 10. Épargne, 11. Analyse IA, 1. Profil Utilisateur, 2. Données de base (Catégories), 3. Revenus, 4. Dépenses, 5. Dashboard (Accueil), 6. Analyse par catégorie (+8 more)

### Community 31 - "opencode.json"
Cohesion: 0.50
Nodes (3): plugin, $schema, .opencode/plugins/graphify.js

### Community 36 - "paginate"
Cohesion: 0.06
Nodes (42): ai_health(), AIAnalysisResponse, AIAnalysisStoredRead, analyze_period(), get_ai_provider(), list_analyses(), DbSession, ge (+34 more)

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

### Community 47 - "simulate"
Cohesion: 0.18
Nodes (15): DbSession, post, UserDep, what_if(), WhatIfRead, Decimal, NotFound, AsyncSession (+7 more)

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

### Community 52 - "savings.tsx"
Cohesion: 0.33
Nodes (3): cpStyles, GOALS, styles

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
- **180 isolated node(s):** `Architecture des écrans`, `1. Profil Utilisateur`, `2. Données de base (Catégories)`, `3. Revenus`, `4. Dépenses` (+175 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `expo-router` connect `expo` to `theme.ts`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `create_goal()` connect `savings_service.py` to `types/index.ts`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `SavingsGoal` connect `types/index.ts` to `savings_service.py`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `money()` (e.g. with `decide_budget()` and `_available_for_user()`) actually correct?**
  _`money()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Architecture des écrans`, `1. Profil Utilisateur`, `2. Données de base (Catégories)` to the rest of the system?**
  _180 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `types/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0673076923076923 - nodes in this community are weakly interconnected._
- **Should `test_analytics.py` be split into smaller, more focused modules?**
  _Cohesion score 0.058333333333333334 - nodes in this community are weakly interconnected._