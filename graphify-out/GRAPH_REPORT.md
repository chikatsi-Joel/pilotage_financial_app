# Graph Report - pilotage_finances_backend  (2026-08-21)

## Corpus Check
- 99 files · ~132,572 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 713 nodes · 1408 edges · 67 communities (42 shown, 25 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 58 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d131eb49`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- types/index.ts
- test_analytics.py
- expenses.py
- entities.py
- dependencies
- savings_service.py
- deps.py
- theme.ts
- analytics_service.py
- routers/budget.py
- services/ai.py
- Expense
- expo
- api-client.test.cjs
- tsconfig.json
- graphify.js
- utils/__init__.py
- pilotage-finances-backend
- category_service.py
- users.py
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
- common.py
- dashboard.tsx
- components.tsx
- simulate
- analyse-detail.tsx
- add-goal.tsx
- devDependencies
- scripts
- savings.tsx
- simulate_what_if
- package.json
- Settings
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

## God Nodes (most connected - your core abstractions)
1. `paginate()` - 20 edges
2. `buildPath()` - 18 edges
3. `money()` - 18 edges
4. `Base` - 17 edges
5. `FinancialAnalyticsEngine` - 15 edges
6. `compute_category_analytics()` - 15 edges
7. `Expense` - 13 edges
8. `mad()` - 12 edges
9. `build_goal_analyses()` - 12 edges
10. `contribute()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `test_all_tables_build_on_sqlite_metadata()` --uses--> `Base`  [INFERRED]
  tests/test_schema.py → app/db/base.py
- `test_extract_known_numbers()` --calls--> `_extract_known_numbers()`  [EXTRACTED]
  tests/test_analytics.py → app/services/ai.py
- `test_validate_llm_output_clean()` --calls--> `_validate_llm_output()`  [EXTRACTED]
  tests/test_analytics.py → app/services/ai.py
- `test_validate_llm_output_detects_hallucination()` --calls--> `_validate_llm_output()`  [EXTRACTED]
  tests/test_analytics.py → app/services/ai.py
- `test_money_rounds()` --calls--> `money()`  [EXTRACTED]
  tests/test_analytics.py → app/services/analytics/engine.py

## Import Cycles
- None detected.

## Communities (67 total, 25 thin omitted)

### Community 0 - "types/index.ts"
Cohesion: 0.07
Nodes (53): ai, path(), analytics, path(), budget, path(), categories, path() (+45 more)

### Community 1 - "test_analytics.py"
Cohesion: 0.09
Nodes (55): FinancialAnalyticsEngine, Category, Expense, forecast(), predict(), score(), Category, CategoryAnalysis (+47 more)

### Community 2 - "expenses.py"
Cohesion: 0.19
Nodes (23): create_expense(), delete_expense(), list_expenses(), date, DbSession, ExpenseCreate, get, post (+15 more)

### Community 3 - "entities.py"
Cohesion: 0.14
Nodes (25): Base, AIAnalysis, Budget, Category, CategoryAnalytics, CategoryType, ConfidenceLevel, DriftSignal (+17 more)

### Community 4 - "dependencies"
Cohesion: 0.15
Nodes (13): expo, expo-linking, dependencies, expo, expo-linking, @react-native-async-storage/async-storage, @react-native-community/datetimepicker, @react-native-community/slider (+5 more)

### Community 5 - "savings_service.py"
Cohesion: 0.09
Nodes (45): contribute(), create_goal(), list_goals(), DbSession, ge, get, le, post (+37 more)

### Community 6 - "deps.py"
Cohesion: 0.17
Nodes (13): get_user(), AsyncSession, User, UUID, get_db(), get_engine(), get_session_factory(), AsyncSession (+5 more)

### Community 7 - "theme.ts"
Cohesion: 0.15
Nodes (8): QUICK_WINS, styles, CATEGORIES, styles, Tab, icons, colors, paperTheme

### Community 8 - "analytics_service.py"
Cohesion: 0.19
Nodes (26): category_analytics(), dashboard(), DbSession, get, post, UserDep, refresh_analytics(), CategoryAnalyticsRead (+18 more)

### Community 9 - "routers/budget.py"
Cohesion: 0.16
Nodes (29): decide_budget(), get_budget(), list_recommendations(), DbSession, get, post, put, UserDep (+21 more)

### Community 10 - "services/ai.py"
Cohesion: 0.12
Nodes (24): Any, AIAnalysisProvider, _build_prompt(), _extract_known_numbers(), _fallback_analysis(), OllamaProvider, _parse_response(), Extract all known numeric values from the input context. (+16 more)

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
Nodes (24): create_category(), list_categories(), DbSession, ge, get, le, post, Query (+16 more)

### Community 30 - "users.py"
Cohesion: 0.16
Nodes (16): create_user(), get_users(), AsyncSession, DbSession, get, post, UserCreate, UserDep (+8 more)

### Community 31 - "opencode.json"
Cohesion: 0.50
Nodes (3): plugin, $schema, .opencode/plugins/graphify.js

### Community 36 - "paginate"
Cohesion: 0.06
Nodes (42): ai_health(), AIAnalysisResponse, AIAnalysisStoredRead, analyze_period(), get_ai_provider(), list_analyses(), DbSession, ge (+34 more)

### Community 43 - "analyse.tsx"
Cohesion: 0.09
Nodes (13): aiStyles, DRIFT_CATEGORIES, DriftCategory, driftStyles, IconName, Recommendation, RECOMMENDATIONS, recoStyles (+5 more)

### Community 44 - "common.py"
Cohesion: 0.18
Nodes (18): BudgetDecision, CategoryCreate, CategoryRead, CategoryUpdate, CursorParams, ExpenseRead, ForecastRead, IncomeCreate (+10 more)

### Community 45 - "dashboard.tsx"
Cohesion: 0.11
Nodes (12): AlertItem, ALERTS, alertStyles, chartStyles, DONUT, donutStyles, legendStyles, SPARKLINE_DATA (+4 more)

### Community 46 - "components.tsx"
Cohesion: 0.15
Nodes (9): FILTERS, styles, TRANSACTIONS, styles, BrandMark(), Card(), Pill(), SectionTitle() (+1 more)

### Community 47 - "simulate"
Cohesion: 0.23
Nodes (12): DbSession, post, UserDep, what_if(), WhatIfRead, NotFound, AsyncSession, Decimal (+4 more)

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

### Community 53 - "simulate_what_if"
Cohesion: 0.70
Nodes (3): Decimal, simulate_what_if(), test_what_if_matches_spec_example()

### Community 54 - "package.json"
Cohesion: 0.40
Nodes (4): main, name, private, version

### Community 55 - "Settings"
Cohesion: 0.50
Nodes (3): Settings, BaseSettings, field_validator

## Knowledge Gaps
- **116 isolated node(s):** `icons`, `IconName`, `DriftCategory`, `WhatIfData`, `Recommendation` (+111 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `create_goal()` connect `savings_service.py` to `types/index.ts`, `common.py`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `SavingsGoal` connect `types/index.ts` to `savings_service.py`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `paginate()` connect `paginate` to `expenses.py`, `savings_service.py`, `routers/budget.py`, `services/ai.py`, `category_service.py`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `money()` (e.g. with `decide_budget()` and `_available_for_user()`) actually correct?**
  _`money()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `icons`, `IconName`, `DriftCategory` to the rest of the system?**
  _116 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `types/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0673076923076923 - nodes in this community are weakly interconnected._
- **Should `test_analytics.py` be split into smaller, more focused modules?**
  _Cohesion score 0.09471153846153846 - nodes in this community are weakly interconnected._