# Décisions d'implémentation

Le document fonctionnel définit les concepts et le pipeline mais ne donne pas toutes les équations. Pour obtenir un moteur déterministe et testable, le backend applique les règles suivantes.

## Baseline

Pour une catégorie donnée, la baseline est la médiane des dépenses mensuelles des mois complets disponibles, en excluant le mois courant. Par défaut, les 6 derniers mois sont utilisés. La médiane est préférée à la moyenne pour limiter l'influence d'une dépense exceptionnelle.

La baseline n'est calculée que si au moins 3 mois historiques contiennent des observations pour la catégorie. En dessous de ce seuil, `confidence=LOW` et aucune recommandation agressive n'est produite.

## Tendance

La tendance est la pente d'une régression linéaire simple des dépenses mensuelles historiques, normalisée par la baseline. Une tendance de `0.58` signifie donc environ +58 % sur l'intervalle de référence relativement à la baseline, et non +58 points de monnaie.

## Déviation

`deviation = (current - baseline) / baseline`.

Seuils par défaut:
- `|deviation| >= 50 %` : `STRONG_DRIFT`
- `|deviation| >= 20 %` : `ATTENTION`
- sinon : `NORMAL`

Les seuils sont configurables par variables d'environnement.

## Volatilité

Pour au moins deux mois, la volatilité est le coefficient de variation : écart-type de la série / moyenne de la série. Elle est classée `LOW`, `MEDIUM` ou `HIGH`.

## Potentiel d'optimisation

- `LOW` : 5 % maximum de réduction ;
- `MEDIUM` : 10 % ;
- `HIGH` : 20 %.

Une catégorie essentielle n'est jamais réduite automatiquement par ce moteur. Une catégorie non essentielle avec forte dérive et fort potentiel reçoit un levier prioritaire.

## Budget

Le budget recommandé démarre par :
1. revenu mensuel prévu ;
2. dépenses essentielles basées sur la baseline lorsqu'elle est disponible ;
3. dépenses variables à partir de la baseline puis réduction déterministe selon l'optimisabilité et la dérive ;
4. épargne recommandée = épargne actuelle + potentiel d'économie, sans dépasser le revenu disponible.

Quand un objectif d'épargne actif existe, l'objectif mensuel est pris en compte comme cible et le moteur signale un éventuel déficit au lieu de fabriquer un chiffre irréaliste.

## Exceptions

Les mois sans dépenses ne sont pas remplacés artificiellement par zéro dans le calcul de baseline, afin de ne pas confondre absence de données et absence de dépense. Les valeurs calculées sont arrondies à 2 décimales et toutes les justifications du budget conservent les composantes utilisées.

## Analyse IA (Ollama / Gemma)

L'analyse IA est un enrichissement linguistique **post-calcul** : elle ne calcule jamais de chiffres. Le moteur déterministe fournit un contexte structuré (dashboard + détails par catégorie) que le modèle reçoit via le prompt système.

**Règles strictes :**
- Le modèle ne reçoit que des données déjà calculées par `analytics.py` / `budget.py`.
- Le prompt système interdit d'inventer ou de modifier des montants, taux ou seuils.
- La réponse du modèle est stockée telle quelle dans `ai_analyses.summary` et jamais réinjectée dans une table de calcul.
- Si Ollama est indisponible, un fallback déterministe génère alerts et recommandations à partir des données existantes.

**Provider :** `OllamaProvider` dans `services/ai.py`, utilisant la bibliothèque `ollama` (Python) pour appeler `/api/chat` d'Ollama. Le modèle par défaut est `gemma3:latest`.

**Configuration :**
- `OLLAMA_BASE_URL` : URL du serveur Ollama (défaut `http://localhost:11434`).
- `OLLAMA_MODEL` : nom du modèle (défaut `gemma3:latest`).
- `OLLAMA_TIMEOUT` : timeout en secondes (défaut `60`).
