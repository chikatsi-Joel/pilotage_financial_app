from fastapi import APIRouter

from app.api.deps import DbSession, UserDep
from app.schemas.common import WhatIfRequest, WhatIfRead
from app.services import what_if_service

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
    return await what_if_service.simulate(user.id, period, payload.category_id, payload.reduction_percent, db,)