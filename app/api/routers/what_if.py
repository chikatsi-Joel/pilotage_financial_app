from fastapi import APIRouter, HTTPException

from app.api.deps import DbSession, UserDep
from app.schemas.common import WhatIfRequest, WhatIfRead
from app.services import what_if_service
from app.services.what_if_service import NotFound

router = APIRouter(
    prefix="/users/{user_id}/what-if", tags=["what-if"]
)

_NOT_FOUND = {404: {"description": "Catégorie introuvable"}}


@router.post(
    "",
    response_model=WhatIfRead,
    responses=_NOT_FOUND,
)
async def what_if(period: str, payload: WhatIfRequest, user: UserDep, db: DbSession,):
    try:
        return await what_if_service.simulate(user.id, period, payload.category_id, payload.reduction_percent, db,)

    except NotFound as exc:
        raise HTTPException(
            status_code=404, detail=str(exc)
        ) from exc
