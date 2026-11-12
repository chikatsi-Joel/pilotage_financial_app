from fastapi import APIRouter, status

from app.api.deps import DbSession, UserDep
from app.schemas.common import (
    DeviceRegister,
    DeviceUnregister,
    NotificationPreferencesRead,
    NotificationPreferencesUpdate,
    TestPushResult,
)
from app.services import push_service

router = APIRouter(prefix="/users/{user_id}/notifications", tags=["notifications"])


@router.post("/devices", status_code=status.HTTP_204_NO_CONTENT)
async def register_device(payload: DeviceRegister, user: UserDep, db: DbSession) -> None:
    await push_service.register_device(user.id, payload, db)


@router.post("/devices/unregister", status_code=status.HTTP_204_NO_CONTENT)
async def unregister_device(payload: DeviceUnregister, user: UserDep, db: DbSession) -> None:
    await push_service.unregister_device(user.id, payload.token, db)


@router.get("/preferences", response_model=NotificationPreferencesRead)
async def read_preferences(user: UserDep, db: DbSession):
    prefs = await push_service.get_preferences(user.id, db)
    await db.commit()
    return prefs


@router.put("/preferences", response_model=NotificationPreferencesRead)
async def update_preferences(
    payload: NotificationPreferencesUpdate, user: UserDep, db: DbSession
):
    return await push_service.update_preferences(user.id, payload, db)


@router.post("/test", response_model=TestPushResult)
async def send_test(user: UserDep, db: DbSession):
    sent = await push_service.send_to_user(
        user.id,
        "🔔 Notifications — activées",
        "Vous recevrez ici vos alertes et résumés\nRéglables par type dans les paramètres Android",
        db,
        {"route": "/dashboard", "kind": "test", "sticker": "bell"},
    )
    return TestPushResult(sent=sent)
