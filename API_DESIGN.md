
# Pilotage Finances - API Design Reference

Backend API pour le pilotage personnalisé des finances personnelles.

**Base URL** : `http://localhost:8000/api/v1`

**Authentification** : MVP sans auth. Le `user_id` est passé dans chaque requête.

---

## Architecture des écrans

L'application mobile suit un flux **5 modules** :

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  Accueil /  │   │  Revenus &  │   │  Analyse &  │   │  Budget &   │   │  Épargne    │
│  Dashboard  │   │  Dépenses   │   │  Insights   │   │  Recommand. │   │  Goals      │
└─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘
```

---

## 1. Profil Utilisateur

| Écran | Méthode | Endpoint | Description |
|-------|---------|----------|-------------|
| Inscription | `POST` | `/users` | Créer un compte |
| Mon profil | `GET` | `/users/{user_id}` | Voir les infos |

---

## 2. Données de base (Catégories)

| Écran | Méthode | Endpoint | Description |
|-------|---------|----------|-------------|
| Liste catégories | `GET` | `/users/{user_id}/categories` | Toutes les catégories |
| Ajouter | `POST` | `/users/{user_id}/categories` | Créer une catégorie |
| Modifier | `PUT` | `/users/{user_id}/categories/{category_id}` | Modifier (nom, essentialité, potentiel, actif) |

**Catégorie** = une enveloppe budgétaire (ex: "Alimentation", "Transport", "Loisirs").

**Champs essentiels pour le mobile :**
- `essentiality` : `ESSENTIAL` | `NON_ESSENTIAL` (détermine si réductible)
- `optimization_potential` : `LOW` | `MEDIUM` | `HIGH` (poids dans le score d'opportunité)

---

## 3. Revenus

| Écran | Méthode | Endpoint | Description |
|-------|---------|----------|-------------|
| Liste revenus | `GET` | `/users/{user_id}/incomes` | Filtrable par `from_date`, `to_date` |
| Ajouter | `POST` | `/users/{user_id}/incomes` | Saisir un revenu |

---

## 4. Dépenses

| Écran | Méthode | Endpoint | Description |
|-------|---------|----------|-------------|
| Liste dépenses | `GET` | `/users/{user_id}/expenses` | Filtrable par `from_date`, `to_date`, `category_id` |
| Ajouter | `POST` | `/users/{user_id}/expenses` | Saisir une dépense (liée à une catégorie) |
| Modifier | `PUT` | `/users/{user_id}/expenses/{expense_id}` | Modifier une dépense |
| Supprimer | `DELETE` | `/users/{user_id}/expenses/{expense_id}` | Supprimer (204) |

---

## 5. Dashboard (Accueil)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/users/{user_id}/analytics/dashboard?period=2026-08` | Vue d'ensemble du mois |

**Réponse `DashboardRead` :**
```json
{
  "period": "2026-08",
  "income": 500000,
  "expenses": 320000,
  "savings": 180000,
  "savings_rate": 0.36,
  "categories_in_drift": 2,
  "potential_savings": 45000,
  "top_drift_categories": [ ... ]
}
```

**Mapping écran :**
- `income` → Revenu du mois
- `expenses` → Dépenses du mois
- `savings` → Épargne du mois (= revenu - dépenses)
- `savings_rate` → Taux d'épargne (0.36 = 36%)
- `categories_in_drift` → Nombre de catégories en dérive
- `potential_savings` → Économies réalisables si recommandations suivies
- `top_drift_categories` → Top 5 des catégories à surveiller (détails complets)

---

## 6. Analyse par catégorie

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/users/{user_id}/analytics/categories?period=2026-08` | Analytics détaillés par catégorie |
| `POST` | `/users/{user_id}/analytics/refresh?period=2026-08` | Forcer le recalcul + persister |

**Réponse `list[CategoryAnalyticsRead]` — par catégorie :**
```json
{
  "category_id": "...",
  "name": "Restauration",
  "essential": false,
  "current_amount": 85000,
  "baseline_amount": 62000,
  "expected_amount": 65000,
  "variation_percentage": 37.1,
  "potential_saving": 20000,
  "opportunity_score": 0.72,
  "profile": {
    "level": 62000,
    "trend": 0.05,
    "seasonality_strength": 0.3,
    "seasonality_reliable": true,
    "volatility": 0.18,
    "anomaly_score": 1.2,
    "change_points": [4],
    "drift_score": 0.65,
    "confidence": 0.82,
    "forecast": {
      "method": "ewma",
      "value": 71000,
      "mae": 8500
    }
  }
}
```

**Mapping écran — Carte catégorie :**
| Champ | Affichage suggéré |
|-------|-------------------|
| `current_amount` | Montant dépensé ce mois |
| `baseline_amount` | "Normale" historique |
| `variation_percentage` | Variation vs baseline (+37%) |
| `potential_saving` | "Vous pourriez économiser X" |
| `opportunity_score` | Score visuel (0-1) → jauge/couleur |
| `profile.trend` | Tendance ↗ ↘ → (INCREASING/DECREASING/STABLE) |
| `profile.drift_score` | Alerte visuelle si >= 0.5 |
| `profile.confidence` | Fiabilité de l'analyse (0-1) |
| `profile.seasonality_reliable` | Badge "saisonnalité fiable" si true |
| `profile.forecast.method` | Méthode de prédiction utilisée |

---

## 7. Simulation What-If

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `POST` | `/users/{user_id}/what-if?period=2026-08` | Simuler une réduction |

**Requête :**
```json
{ "category_id": "...", "reduction_percent": 20 }
```

**Réponse :**
```json
{
  "period": "2026-08",
  "category_name": "Restauration",
  "current_amount": 85000,
  "reduction_percent": 20,
  "new_target": 68000,
  "monthly_saving": 17000,
  "annual_saving": 204000,
  "projected_savings_rate": 0.394
}
```

**Mapping écran :** Slider de pourcentage → afficher en temps réel l'économie mensuelle/annuelle et le nouveau taux d'épargne.

---

## 8. Budget

| Écran | Méthode | Endpoint | Description |
|-------|---------|----------|-------------|
| Générer budget | `POST` | `/users/{user_id}/budget/recommendation?period=2026-08` | Génère + persiste le budget recommandé |
| Voir budget | `GET` | `/users/{user_id}/budget?period=2026-08` | Budget stocké |
| Décision | `PUT` | `/users/{user_id}/budget/decision?period=2026-08` | Accepter le budget |

**Réponse `BudgetRead` :**
```json
{
  "period": "2026-08",
  "projected_income": 500000,
  "current_expenses": 320000,
  "recommended_expenses": 295000,
  "current_savings": 180000,
  "recommended_savings": 205000,
  "target_savings": 100000,
  "potential_savings": 25000,
  "target_gap": 0,
  "categories": [
    {
      "category_id": "...",
      "category_name": "Restauration",
      "current": 85000,
      "baseline": 62000,
      "recommended": 68000,
      "essential": false,
      "reduction": 17000,
      "reason": "Réduction de 20% fondée sur la variation de 37.1%."
    }
  ],
  "rationale": "Budget calculé à partir du revenu prévu..."
}
```

---

## 9. Recommandations

| Écran | Méthode | Endpoint | Description |
|-------|---------|----------|-------------|
| Liste | `GET` | `/users/{user_id}/budget/recommendations?period=2026-08` | Recommandations du mois |
| Accepter/Rejeter | `POST` | `/users/{user_id}/budget/recommendations/{id}/status?status=ACCEPTED` | Changer le statut |

**Statuts :** `PROPOSED` → `ACCEPTED` | `REJECTED` | `ADJUSTED`

**Mapping écran :** Liste de cartes avec swipe → Accepter / Rejeter. Chaque carte montre :
- Catégorie concernée
- Montant d'impact (`impact_estimated`)
- Justification textuelle
- Badge statut coloré

---

## 10. Épargne

| Écran | Méthode | Endpoint | Description |
|-------|---------|----------|-------------|
| Mes objectifs | `GET` | `/users/{user_id}/savings-goals` | Liste des objectifs actifs |
| Créer objectif | `POST` | `/users/{user_id}/savings-goals` | Nouvel objectif |
| Contribuer | `POST` | `/users/{user_id}/savings-goals/{goal_id}/contribute` | Ajouter de l'argent |

**Réponse `SavingsGoalRead` :**
```json
{
  "id": "...",
  "name": "Vacances",
  "target_amount": 500000,
  "deadline": "2026-12-31",
  "active": true,
  "current_amount": 150000,
  "contributions": [
    { "id": "...", "amount": 100000, "created_at": "2026-07-15T10:30:00" },
    { "id": "...", "amount": 50000, "created_at": "2026-08-10T14:00:00" }
  ]
}
```

**Mapping écran — Carte objectif :**
- `current_amount / target_amount` → Barre de progression
- `deadline` → Compte à rebours
- `contributions` → Historique des versements (liste)
- `completed` (de la réponse contribute) → Animation succès

**Validation côté backend :**
- Le montant ne peut pas dépasser les fonds disponibles du mois
- Les fonds disponibles = Revenus - Dépenses - Contributions du mois

---

## 11. Analyse IA

| Écran | Méthode | Endpoint | Description |
|-------|---------|----------|-------------|
| Lancer analyse | `POST` | `/users/{user_id}/ai/analyze?period=2026-08` | Analyse IA complète |
| Historique | `GET` | `/users/{user_id}/ai/analyses` | 20 dernières analyses |

**Réponse `AIAnalysisResponse` :**
```json
{
  "period": "2026-08",
  "summary": "Votre mois d'août montre une hausse des dépenses...",
  "alerts": [
    { "category": "Restauration", "drift_score": 0.65, "variation_percentage": 37.1 }
  ],
  "recommendations": [
    { "category": "Restauration", "action": "Réduire de 17000 par mois", "justification": "..." }
  ],
  "projected_impact": { "total_potential_savings": "45000" },
  "fallback": false,
  "parse_error": null,
  "number_warnings": null
}
```

**Mapping écran :** Écran narratif avec :
- `summary` → Texte principal (markdown/richtext)
- `alerts` → Section alertes avec icônes rouges/orange
- `recommendations` → Section recommandations actionnables
- `fallback` → Badge "Analyse locale" si IA indisponible

---

## Flow type de l'application

```
1. Onboarding → POST /users → récupérer user_id
2. Saisie revenus → POST /incomes (chaque entrée d'argent)
3. Saisie dépenses → POST /expenses (chaque sortie)
4. Dashboard → GET /analytics/dashboard → vue d'ensemble
5. Explorer → GET /analytics/categories → détail par catégorie
6. Simuler → POST /what-if → "Et si je réduis de X% ?"
7. Budget → POST /budget/recommendation → plan du mois
8. Décider → PUT /budget/decision → valider le budget
9. Recommandations → POST /recommendations/{id}/status → accepter/rejeter
10. Épargne → POST /savings-goals + POST /contribute → épargner
11. IA → POST /ai/analyze → analyse narrativre
```

---

## Enums disponibles

| Enum | Valeurs | Utilisé pour |
|------|---------|--------------|
| `Essentiality` | `ESSENTIAL`, `NON_ESSENTIAL` | Catégorie essentielle ou non |
| `OptimizationPotential` | `LOW`, `MEDIUM`, `HIGH` | Potentiel d'économie |
| `RecommendationStatus` | `PROPOSED`, `ACCEPTED`, `REJECTED`, `ADJUSTED` | Cycle de vie d'une recommandation |
| `ConfidenceLevel` | `LOW`, `MEDIUM`, `HIGH` | Fiabilité de l'analyse |
| `DriftSignal` | `NORMAL`, `ATTENTION`, `STRONG_DRIFT` | Niveau d'alerte dérive |
| `TrendDirection` | `DECREASING`, `STABLE`, `INCREASING` | Tendance du trend |

---

## Codes d'erreur

| Code | Signification |
|------|---------------|
| `404` | Ressource introuvable (user, catégorie, objectif, budget) |
| `409` | Conflit (ex: recommandation déjà décidée) |
| `422` | Données invalides (format period, montants, enums) |
| `503` | Service IA indisponible (fallback utilisé) |
