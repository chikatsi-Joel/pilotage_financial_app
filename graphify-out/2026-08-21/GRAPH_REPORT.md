# Graph Report - pilotage_finances_backend  (2026-08-20)

## Corpus Check
- 96 files · ~127,886 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 646 nodes · 1327 edges · 43 communities (29 shown, 14 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 58 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a3bd0aba`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- types/index.ts
- test_analytics.py
- paginate
- entities.py
- dependencies
- savings_service.py
- deps.py
- components.tsx
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
- common.py
- opencode.json
- AGENTS.md
- RecommendationStatus
- RecommendationStatus
- Category
- list_incomes
- SavingsGoal
- BaseModel
- CategoryCreate
- CategoryUpdate
- put
- SavingsGoalCreate

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

## Communities (43 total, 14 thin omitted)

### Community 0 - "types/index.ts"
Cohesion: 0.07
Nodes (53): ai, path(), analytics, path(), budget, path(), categories, path() (+45 more)

### Community 1 - "test_analytics.py"
Cohesion: 0.11
Nodes (52): FinancialAnalyticsEngine, Category, Expense, forecast(), predict(), score(), Category, CategoryAnalysis (+44 more)

### Community 2 - "paginate"
Cohesion: 0.12
Nodes (32): create_expense(), delete_expense(), list_expenses(), date, DbSession, ExpenseCreate, get, post (+24 more)

### Community 3 - "entities.py"
Cohesion: 0.14
Nodes (25): Base, AIAnalysis, Budget, Category, CategoryAnalytics, CategoryType, ConfidenceLevel, DriftSignal (+17 more)

### Community 4 - "dependencies"
Cohesion: 0.04
Nodes (47): axios, expo, expo-constants, expo-linking, expo-status-bar, dependencies, axios, expo (+39 more)

### Community 5 - "savings_service.py"
Cohesion: 0.08
Nodes (47): contribute(), create_goal(), list_goals(), DbSession, ge, get, le, post (+39 more)

### Community 6 - "deps.py"
Cohesion: 0.08
Nodes (31): get_user(), AsyncSession, User, UUID, ai_health(), AIAnalysisResponse, AIAnalysisStoredRead, analyze_period() (+23 more)

### Community 7 - "components.tsx"
Cohesion: 0.07
Nodes (16): styles, CATEGORIES, styles, Tab, ALERTS, donut, styles, WEEKS (+8 more)

### Community 8 - "analytics_service.py"
Cohesion: 0.19
Nodes (25): category_analytics(), dashboard(), DbSession, get, post, UserDep, refresh_analytics(), CategoryAnalyticsRead (+17 more)

### Community 9 - "routers/budget.py"
Cohesion: 0.19
Nodes (26): decide_budget(), get_budget(), list_recommendations(), DbSession, get, post, put, UserDep (+18 more)

### Community 10 - "services/ai.py"
Cohesion: 0.11
Nodes (27): Any, AIAnalysisProvider, _build_prompt(), _extract_known_numbers(), _fallback_analysis(), OllamaProvider, _parse_response(), Extract all known numeric values from the input context. (+19 more)

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

### Community 30 - "common.py"
Cohesion: 0.06
Nodes (49): create_user(), get_users(), AsyncSession, DbSession, get, post, UserCreate, UserDep (+41 more)

### Community 31 - "opencode.json"
Cohesion: 0.50
Nodes (3): plugin, $schema, .opencode/plugins/graphify.js

### Community 36 - "list_incomes"
Cohesion: 0.14
Nodes (18): create_income(), list_incomes(), date, DbSession, ge, get, IncomeCreate, le (+10 more)

## Knowledge Gaps
- **80 isolated node(s):** `icons`, `CATEGORIES`, `Tab`, `styles`, `ALERTS` (+75 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `create_goal()` connect `savings_service.py` to `types/index.ts`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `SavingsGoal` connect `types/index.ts` to `savings_service.py`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `paginate()` connect `paginate` to `list_incomes`, `savings_service.py`, `deps.py`, `routers/budget.py`, `services/ai.py`, `category_service.py`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `money()` (e.g. with `decide_budget()` and `_available_for_user()`) actually correct?**
  _`money()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `icons`, `CATEGORIES`, `Tab` to the rest of the system?**
  _80 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `types/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0673076923076923 - nodes in this community are weakly interconnected._
- **Should `test_analytics.py` be split into smaller, more focused modules?**
  _Cohesion score 0.10576414595452142 - nodes in this community are weakly interconnected._