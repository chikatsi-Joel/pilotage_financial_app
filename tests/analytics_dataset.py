"""Jeu de données réaliste et déterministe pour comparer les analytics avant / après refactor.

30 mois d'historique (2024-01 → 2026-06) sur 7 catégories aux profils variés : historique
complet, mois manquants, saisonnalité, rupture de niveau, catégorie inactive, catégorie sans
dépense, dépenses futures (après la période analysée) et un second utilisateur (isolation).
"""

from __future__ import annotations

import random
from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, Essentiality, Expense, Income, OptimizationPotential, User

PERIOD = "2026-06"

_CATEGORIES = [
    # nom, essentielle, potentiel, actif
    ("Alimentation", True, OptimizationPotential.LOW, True),
    ("Restaurants", False, OptimizationPotential.HIGH, True),
    ("Transport", True, OptimizationPotential.MEDIUM, True),
    ("Loisirs", False, OptimizationPotential.MEDIUM, True),
    ("Abonnements", False, OptimizationPotential.HIGH, True),
    ("Ancienne", False, OptimizationPotential.LOW, False),
    ("Vide", False, OptimizationPotential.LOW, True),
]


def _months(first: tuple[int, int], last: tuple[int, int]) -> list[tuple[int, int]]:
    (y, m), out = first, []
    while (y, m) <= last:
        out.append((y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


async def seed(db: AsyncSession) -> User:
    rng = random.Random(20261112)
    user = User(name="Golden", currency="XAF")
    other = User(name="Autre", currency="XAF")
    db.add_all([user, other])
    await db.flush()

    cats: dict[str, Category] = {}
    for name, essential, potential, active in _CATEGORIES:
        cats[name] = Category(
            user_id=user.id,
            name=name,
            essentiality=Essentiality.ESSENTIAL if essential else Essentiality.NON_ESSENTIAL,
            optimization_potential=potential,
            active=active,
        )
    other_cat = Category(
        user_id=other.id, name="Alimentation",
        essentiality=Essentiality.ESSENTIAL, optimization_potential=OptimizationPotential.LOW,
    )
    db.add_all([*cats.values(), other_cat])
    await db.flush()

    for amount, day, source, recurring in (
        ("650000.00", date(2024, 1, 1), "Salaire", True),
        ("45000.50", date(2026, 6, 3), "Prime", False),
        ("30000.00", date(2026, 5, 3), "Vente", False),
    ):
        db.add(Income(user_id=user.id, amount=Decimal(amount), income_date=day,
                      source=source, recurring=recurring))

    def cents(low: int, high: int) -> Decimal:
        return Decimal(rng.randint(low * 100, high * 100)) / 100

    expenses: list[Expense] = []

    def add(cat: str, d: date, amount: Decimal) -> None:
        expenses.append(
            Expense(user_id=user.id, category_id=cats[cat].id, amount=amount, expense_date=d)
        )

    for idx, (y, m) in enumerate(_months((2024, 1), (2026, 6))):
        # Alimentation : plusieurs achats par mois, légère inflation
        for day in (2, 9, 16, 23):
            add("Alimentation", date(y, m, day), cents(18000, 26000) + Decimal(idx * 120))
        # Restaurants : rupture de niveau à mi-parcours, un mois sur cinq absent
        if idx % 5 != 3:
            base = 15000 if idx < 15 else 32000
            for day in (6, 20):
                add("Restaurants", date(y, m, day), cents(base, base + 9000))
        # Transport : saisonnier (pics en juillet/août et décembre)
        bump = 2.2 if m in (7, 8, 12) else 1.0
        add("Transport", date(y, m, 11), cents(int(20000 * bump), int(26000 * bump)))
        # Loisirs : irrégulier, beaucoup de mois manquants
        if rng.random() < 0.45:
            add("Loisirs", date(y, m, 14), cents(5000, 60000))
        # Abonnements : montant fixe + un mois à 0
        add("Abonnements", date(y, m, 1),
            Decimal("0.00") if idx == 7 else Decimal("12990.99"))
        # Catégorie inactive : doit être ignorée
        add("Ancienne", date(y, m, 8), cents(1000, 3000))

    # Abonnements : n'existait pas avant 2025 sur un second achat ponctuel
    add("Abonnements", date(2026, 6, 28), Decimal("4999.01"))
    # Dépenses futures (après la période) : ignorées
    add("Alimentation", date(2026, 7, 2), Decimal("999999.99"))
    add("Restaurants", date(2026, 8, 15), Decimal("123456.78"))
    # Fin de mois / bissextile
    add("Loisirs", date(2024, 2, 29), Decimal("7777.77"))
    add("Loisirs", date(2026, 6, 30), Decimal("31.41"))
    # Autre utilisateur : ne doit jamais apparaître
    for (y, m) in _months((2024, 1), (2026, 6)):
        expenses.append(Expense(user_id=other.id, category_id=other_cat.id,
                                amount=Decimal("88888.88"), expense_date=date(y, m, 10)))

    db.add_all(expenses)
    await db.commit()
    return user
