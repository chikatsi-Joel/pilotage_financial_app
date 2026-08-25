# Graph Report - pilotage_finances_backend  (2026-08-20)

## Corpus Check
- 94 files · ~124,355 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 623 nodes · 1355 edges · 38 communities (28 shown, 10 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 73 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d60bc121`
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
- components.tsx
- analytics_service.py
- routers/budget.py
- paginate
- Expense
- expo
- api-client.test.cjs
- tsconfig.json
- graphify.js
- utils/__init__.py
- pilotage-finances-backend
- master_data.py
- money
- opencode.json
- AGENTS.md
- RecommendationStatus
- RecommendationStatus
- Category
- Income
- SavingsGoal

## God Nodes (most connected - your core abstractions)
1. `paginate()` - 19 edges
2. `buildPath()` - 18 edges
3. `money()` - 18 edges
4. `Base` - 17 edges
5. `FinancialAnalyticsEngine` - 15 edges
6. `compute_category_analytics()` - 15 edges
7. `PaginatedResponse` - 14 edges
8. `Expense` - 13 edges
9. `build_goal_analyses()` - 12 edges
10. `contribute()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `test_all_tables_build_on_sqlite_metadata()` --uses--> `Base`  [INFERRED]
  tests/test_schema.py → app/db/base.py
- `create()` --calls--> `Category`  [EXTRACTED]
  app/services/category_service.py → finance_mobile/src/shared/types/index.ts
- `create()` --calls--> `Expense`  [EXTRACTED]
  app/services/expense_service.py → finance_mobile/src/shared/types/index.ts
- `create()` --calls--> `Income`  [EXTRACTED]
  app/services/income_service.py → finance_mobile/src/shared/types/index.ts
- `create_goal()` --calls--> `SavingsGoal`  [EXTRACTED]
  app/services/savings_service.py → finance_mobile/src/shared/types/index.ts

## Import Cycles
- None detected.

## Communities (38 total, 10 thin omitted)

### Community 0 - "types/index.ts"
Cohesion: 0.07
Nodes (53): ai, path(), analytics, path(), budget, path(), categories, path() (+45 more)

### Community 1 - "test_analytics.py"
Cohesion: 0.11
Nodes (52): FinancialAnalyticsEngine, Category, Expense, forecast(), predict(), score(), Category, CategoryAnalysis (+44 more)

### Community 2 - "common.py"
Cohesion: 0.07
Nodes (55): create_expense(), delete_expense(), list_expenses(), date, DbSession, ExpenseCreate, get, post (+47 more)

### Community 3 - "entities.py"
Cohesion: 0.14
Nodes (25): Base, AIAnalysis, Budget, Category, CategoryAnalytics, CategoryType, ConfidenceLevel, DriftSignal (+17 more)

### Community 4 - "dependencies"
Cohesion: 0.04
Nodes (47): axios, expo, expo-constants, expo-linking, expo-status-bar, dependencies, axios, expo (+39 more)

### Community 5 - "savings_service.py"
Cohesion: 0.10
Nodes (39): contribute(), create_goal(), list_goals(), DbSession, get, post, SavingsGoalCreate, UserDep (+31 more)

### Community 6 - "deps.py"
Cohesion: 0.08
Nodes (31): get_user(), AsyncSession, User, UUID, create_user(), get_users(), AsyncSession, DbSession (+23 more)

### Community 7 - "components.tsx"
Cohesion: 0.11
Nodes (17): styles, categories, styles, styles, driftCategories, styles, whatIfExample, icons (+9 more)

### Community 8 - "analytics_service.py"
Cohesion: 0.19
Nodes (25): category_analytics(), dashboard(), DbSession, get, post, UserDep, refresh_analytics(), CategoryAnalyticsRead (+17 more)

### Community 9 - "routers/budget.py"
Cohesion: 0.16
Nodes (29): decide_budget(), get_budget(), list_recommendations(), DbSession, get, post, put, UserDep (+21 more)

### Community 10 - "paginate"
Cohesion: 0.07
Nodes (45): Any, ai_health(), AIAnalysisResponse, AIAnalysisStoredRead, analyze_period(), get_ai_provider(), list_analyses(), BaseModel (+37 more)

### Community 12 - "expo"
Cohesion: 0.07
Nodes (29): expo-router, backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, predictiveBackGestureEnabled (+21 more)

### Community 13 - "api-client.test.cjs"
Cohesion: 0.22
Nodes (7): assert, { buildPath }, fs, Module, path, test, ts

### Community 14 - "tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, strict, extends, expo/tsconfig.base

### Community 29 - "master_data.py"
Cohesion: 0.18
Nodes (22): create_category(), list_categories(), CategoryCreate, CategoryUpdate, DbSession, get, post, put (+14 more)

### Community 30 - "money"
Cohesion: 0.15
Nodes (18): DbSession, post, UserDep, what_if(), WhatIfRead, money(), Decimal, Decimal (+10 more)

### Community 31 - "opencode.json"
Cohesion: 0.50
Nodes (3): plugin, $schema, .opencode/plugins/graphify.js

## Knowledge Gaps
- **77 isolated node(s):** `$schema`, `.opencode/plugins/graphify.js`, `graphify`, `icons`, `categories` (+72 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `create_goal()` connect `savings_service.py` to `types/index.ts`, `common.py`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `SavingsGoal` connect `types/index.ts` to `savings_service.py`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `money()` connect `money` to `analytics_service.py`, `test_analytics.py`, `savings_service.py`, `routers/budget.py`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `money()` (e.g. with `decide_budget()` and `_available_for_user()`) actually correct?**
  _`money()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `.opencode/plugins/graphify.js`, `graphify` to the rest of the system?**
  _77 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `types/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0673076923076923 - nodes in this community are weakly interconnected._
- **Should `test_analytics.py` be split into smaller, more focused modules?**
  _Cohesion score 0.10576414595452142 - nodes in this community are weakly interconnected._