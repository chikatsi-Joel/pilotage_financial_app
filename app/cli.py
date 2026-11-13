"""Commandes d'administration.

    python -m app.cli create-admin vous@exemple.com

Le mot de passe est demandé au clavier (12 caractères minimum) ; relancer la commande avec un
compte existant change son mot de passe et ferme ses sessions.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys

from app.db.session import get_session_factory
from app.services.admin import auth as admin_auth


async def _create_admin(email: str, password: str) -> None:
    async with get_session_factory()() as db:
        admin = await admin_auth.create_admin(email, password, db)
        print(f"Compte admin prêt : {admin.email}")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create-admin", help="Créer un compte du backoffice")
    create.add_argument("email")
    args = parser.parse_args()

    if args.command == "create-admin":
        password = getpass.getpass("Mot de passe : ")
        if password != getpass.getpass("Confirmez : "):
            sys.exit("Les mots de passe ne correspondent pas")
        try:
            asyncio.run(_create_admin(args.email, password))
        except ValueError as exc:
            sys.exit(str(exc))


if __name__ == "__main__":
    main()
