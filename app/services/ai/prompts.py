"""Prompts envoyés aux modèles : analyse du mois (contexte compact) et lecture de ticket."""

from __future__ import annotations

from typing import Any

from app.services.context.context_promt import SYSTEM_PROMPT

__all__ = [
    "CATEGORY_SYSTEM_PROMPT",
    "RECEIPT_SYSTEM_PROMPT",
    "build_category_prompt",
    "SYSTEM_PROMPT",
    "build_prompt",
    "build_receipt_prompt",
    "format_number",
]

RECEIPT_SYSTEM_PROMPT = """
Tu extrais les champs d'un ticket de caisse à partir de son image.

Règles :
- n'invente aucune valeur, utilise null quand l'information est illisible ;
- amount : montant total payé, nombre décimal positif ;
- category : le nom exact d'une catégorie fournie dans le contexte, sinon null ;
- expense_date : date d'achat au format YYYY-MM-DD, sinon la date du jour ;
- merchant : nom du commerçant lisible sur le ticket, sinon null ;
- description : ligne descriptive courte, sinon null ;
- items : liste des lignes d'achat lisibles du ticket (un élément par produit
  ou service). Chaque élément a un label court, un amount (prix de la ligne,
  nombre décimal positif) et une category (nom exact d'une catégorie fournie,
  sinon null). Liste vide si les lignes sont illisibles ou s'il n'y a qu'un achat.

Retourne uniquement un JSON valide de la forme :
{"amount": null, "category": null, "expense_date": null, "merchant": null, "description": null,
 "items": [{"label": "Lait", "amount": 1.5, "category": null}]}
"""

# Montants dont le zéro a un sens (« rien dépensé », « aucun revenu ») : toujours envoyés.
# Les autres indicateurs à 0 (variation, dérive…) sont omis : absent = 0 dans le prompt.
_KEEP_ZERO = frozenset({"revenu", "dépenses", "épargne", "actuel", "acquis"})


def format_number(value: Any, digits: int = 0) -> str | None:
    """Nombre arrondi pour le prompt (jetons facturés) ; None si absent ou illisible."""
    if value is None or isinstance(value, bool):
        return None
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    if digits == 0:
        # Petits montants (devises à centimes) : 2 décimales, sinon l'arrondi sortirait de la
        # tolérance de 5 % du validateur (2,6 → 3).
        if abs(x) >= 100 or x == round(x):
            return str(round(x))
        digits = 2
    text = f"{x:.{digits}f}".rstrip("0").rstrip(".")
    return text or "0"


def _fields(pairs: list[tuple[str, str | None]]) -> str:
    """« k=v » des valeurs connues ; zéros omis sauf pour les montants de _KEEP_ZERO."""
    return ", ".join(
        f"{k}={v}"
        for k, v in pairs
        if v not in (None, "") and (v != "0" or k in _KEEP_ZERO)
    )


def build_prompt(context: dict[str, Any]) -> str:
    """Contexte compact : nombres arrondis, champs nuls ou absents omis, sans identifiants.

    Chaque jeton est facturé : seules les valeurs utiles à l'analyse sont envoyées. Les
    arrondis restent dans la tolérance de `validate_llm_output` (5 %).
    """
    num = format_number
    d = context.get("dashboard", {})
    savings = context.get("savings", {})
    lines = [
        f"Mois : {context.get('period', '?')}",
        _fields([
            ("revenu", num(d.get("income"))),
            ("dépenses", num(d.get("expenses"))),
            ("épargne", num(d.get("savings"))),
            ("taux_épargne", num(d.get("savings_rate"), 2)),
            ("économies_potentielles", num(d.get("potential_savings"))),
            ("contributions_objectifs", num(savings.get("total_monthly_contributions"))),
            ("épargne_non_affectée", num(savings.get("unallocated_monthly_savings"))),
        ]),
        "",
        "Catégories (actuel, habitude, variation % vs habitude à date, tendance, volatilité,"
        " anomalie, dérive, confiance, prévision [fourchette], usage, projection, potentiel) :",
    ]
    for c in context.get("categories", []):
        low, high = num(c.get("forecast_low")), num(c.get("forecast_high"))
        forecast = num(c.get("forecast_value"))
        if forecast and low and high:
            forecast = f"{forecast} [{low}-{high}]"
        usage = c.get("usage_rate")
        tags = ["essentielle" if c.get("essential") else "non essentielle"]
        if c.get("seasonality_reliable"):
            tags.append(f"saisonnalité={num(c.get('seasonality_strength'), 2)}")
        lines.append(
            f"- {c.get('name', '?')} ({', '.join(tags)}) : "
            + _fields([
                ("actuel", num(c.get("current_amount"))),
                ("habitude", num(c.get("baseline_amount"))),
                ("variation", num(c.get("variation_percentage"), 1)),
                ("tendance", num(c.get("trend"), 2)),
                ("volatilité", num(c.get("volatility"), 2)),
                ("anomalie", num(c.get("anomaly_score"), 1)),
                ("dérive", num(c.get("drift_score"), 2)),
                ("confiance", num(c.get("confidence"), 2)),
                ("prévision", forecast),
                ("usage", num(usage, 2) if usage is not None and usage < 1 else None),
                ("projection", num(c.get("month_projection"))),
                ("potentiel", num(c.get("potential_saving"))),
            ])
        )

    goals = context.get("savings_goals", [])
    if goals:
        lines.extend(["", "Objectifs d'épargne :"])
        for g in goals:
            lines.append(
                f"- {g.get('name', '?')} : "
                + _fields([
                    ("cible", num(g.get("target_amount"))),
                    ("échéance", g.get("target_date")),
                    ("acquis", num(g.get("current_amount"))),
                    ("progression_%", num(g.get("progress_percentage"), 1)),
                    ("moyenne_6_mois", num(g.get("average_monthly_contribution"))),
                    ("dernier_mois", num(g.get("recent_monthly_contribution"))),
                    ("rythme", g.get("contribution_trend")),
                    ("régularité", num(g.get("contribution_regularity"), 2)),
                    ("requis_par_mois", num(g.get("required_monthly_contribution"))),
                ])
            )
    return "\n".join(lines)


CATEGORY_SYSTEM_PROMPT = """
Tu es l'assistant financier de l'application Lucia. On te donne UNE catégorie de dépenses
d'un utilisateur pour un mois. Explique-lui simplement ce qu'il faut savoir sur cette catégorie.

Règles :
- français simple, vouvoiement ;
- n'utilise que les chiffres fournis, n'en calcule aucun autre ; montants suivis de la devise,
  pourcentages avec « % » ;
- compare le mois à l'habitude (à date si le mois est en cours) et dis si c'est normal ;
- cite les plus grosses dépenses si elles expliquent l'écart ;
- si une prévision est fournie, dis à quoi s'attendre d'ici la fin du mois ;
- catégorie essentielle : pas de conseil de supprimer, seulement d'optimiser.

Réponds uniquement en JSON :
{"summary": "2 à 3 phrases", "points": ["2 à 3 points courts : à retenir ou à faire"]}
"""


def build_category_prompt(context: dict[str, Any]) -> str:
    """Contexte d'une catégorie (voir `ai_explain_service.build_category_context`)."""
    num = format_number
    cat = context["category"]
    progress = context.get("month_progress")
    month = context["period"]
    if progress:
        month += f" (en cours : jour {progress['day']} sur {progress['days_in_month']})"
    lines = [
        f"Mois : {month}",
        f"Devise : {context['currency']}",
        f"Catégorie : {cat['name']} ({'essentielle' if cat['essential'] else 'non essentielle'})",
        _fields([
            ("dépensé", num(cat.get("current_amount"))),
            ("habitude_mois", num(cat.get("baseline_amount"))),
            ("attendu_à_date", num(cat.get("expected_amount"))),
            ("écart_%", num(cat.get("variation_pct"), 1)),
            ("budget", num(cat.get("budget"))),
            ("budget_utilisé_%", num(cat.get("budget_used_pct"), 1)),
            ("prévision_fin_de_mois", num(cat.get("projection"))),
            ("fourchette_basse", num(cat.get("forecast_low"))),
            ("fourchette_haute", num(cat.get("forecast_high"))),
            ("économie_possible", num(cat.get("potential_saving"))),
            ("nombre_de_dépenses", num(context.get("expense_count"))),
        ]),
    ]
    if cat.get("drifting"):
        lines.append("Hausse durable détectée par rapport aux mois précédents.")
    expenses = context.get("top_expenses", [])
    if expenses:
        lines.append("Plus grosses dépenses du mois :")
        for e in expenses:
            note = f" ({e['note']})" if e.get("note") else ""
            lines.append(f"- le {e['day']} : {num(e['amount'])}{note}")
    return "\n".join(lines)


def build_receipt_prompt(known_categories: list[str]) -> str:
    """Consigne de lecture d'un ticket, avec les catégories de l'utilisateur."""
    catalogue = (
        "\n".join(f"- {name}" for name in known_categories) or "(aucune catégorie enregistrée)"
    )
    return (
        "Catégories disponibles pour cet utilisateur :\n"
        f"{catalogue}\n\n"
        "Extrais les champs de ce ticket de caisse."
    )
