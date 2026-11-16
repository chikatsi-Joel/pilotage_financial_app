"""Suppression définitive d'un compte et de toutes ses données (exigence Play Store / App Store).

Ordre voulu :
1. ré-identification forte (jeton Firebase de moins de 5 min, ou mot de passe) ;
2. effacement en base, en une transaction ;
3. seulement ensuite, suppression du compte Firebase (au mieux) : dans l'ordre inverse, un
   échec en base laisserait des données qu'on ne pourrait plus supprimer faute de connexion.
"""

from __future__ import annotations

import logging
import time

import httpx
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import Expense, User
from app.schemas.common import AccountDeletionRequest
from app.services import firebase_auth, google_oauth, settings_store
from app.services.admin.remote_config import InvalidFlag, parse_service_account
from app.services.auth_service import verify_password
from app.services.errors import Forbidden, Unauthorized

log = logging.getLogger(__name__)

REAUTH_MAX_AGE = 300  # secondes depuis la dernière authentification Firebase
FIREBASE_SCOPE = "https://www.googleapis.com/auth/cloud-platform"
FIREBASE_DELETE = "https://identitytoolkit.googleapis.com/v1/projects/{project}/accounts:delete"
_REFUSED = "Identification incorrecte, réessayez"


async def _reauthenticate(user: User, payload: AccountDeletionRequest) -> None:
    """Jeton Firebase récent du même compte, ou mot de passe Lucia correct.

    Le mot de passe reste accepté pour un compte rattaché à Firebase : sinon, un appareil
    sans session Firebase (build sans module natif, session perdue) ne pourrait jamais
    supprimer le compte.
    """
    if user.firebase_uid and payload.id_token:
        try:
            identity = await firebase_auth.verify_id_token(payload.id_token)
        except Unauthorized as exc:
            raise Forbidden(_REFUSED) from exc
        if identity.uid == user.firebase_uid and time.time() - identity.auth_time <= REAUTH_MAX_AGE:
            return
        raise Forbidden(_REFUSED)
    if user.password_hash and payload.password:
        if verify_password(payload.password, user.password_hash):
            return
    raise Forbidden(_REFUSED)


async def delete_account(user: User, payload: AccountDeletionRequest, db: AsyncSession) -> None:
    """Ré-identifie puis efface l'utilisateur et toutes ses données ; lève `Forbidden` sinon."""
    await _reauthenticate(user, payload)
    user_id, firebase_uid = user.id, user.firebase_uid

    # SQL direct : `db.delete(user)` chargerait en mémoire toutes ses dépenses, revenus…
    # Les dépenses d'abord : expenses.category_id est en RESTRICT (on ne supprime pas une
    # catégorie qui a des dépenses) ; le reste part par ON DELETE CASCADE depuis users.
    await db.execute(delete(Expense).where(Expense.user_id == user_id))
    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()
    log.info("account_deleted", extra={"user_id": str(user_id), "firebase": bool(firebase_uid)})

    if firebase_uid:
        # Strictement au mieux : la base est déjà effacée, une erreur ici ne doit pas faire
        # croire à l'utilisateur que la suppression a échoué.
        try:
            await delete_firebase_user(firebase_uid)
        except Exception as exc:
            log.warning("firebase_delete_failed", extra={"reason": type(exc).__name__})


async def delete_firebase_user(uid: str) -> bool:
    """Supprime le compte Firebase Auth si un compte de service est configuré.

    Au mieux : un échec est journalisé sans bloquer (les données Lucia sont déjà effacées,
    l'app supprime aussi le compte de son côté). Compte déjà absent = succès.
    """
    raw = await settings_store.get("firebase_service_account")
    if not raw:
        return False
    try:
        account = parse_service_account(raw)
        project = account.get("project_id") or settings.firebase_project_id
        async with httpx.AsyncClient(timeout=10) as client:
            token = await google_oauth.access_token(client, account, FIREBASE_SCOPE)
            res = await client.post(
                FIREBASE_DELETE.format(project=project),
                json={"localId": uid},
                headers={"Authorization": f"Bearer {token}"},
            )
    except (InvalidFlag, google_oauth.GoogleAuthError, httpx.HTTPError) as exc:
        log.warning("firebase_delete_failed", extra={"reason": type(exc).__name__})
        return False
    if res.status_code == 200 or "USER_NOT_FOUND" in res.text:
        return True
    log.warning("firebase_delete_failed", extra={"status": res.status_code})
    return False
