from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.api.deps import DbSession, UserDep
from app.core.config import settings
from app.schemas.common import ReceiptScanRead
from app.services import receipt_service

router = APIRouter(
    prefix="/users/{user_id}/receipts", tags=["receipts"]
)

_NOT_FOUND = {404: {"description": "Ressource introuvable"}}


@router.post(
    "/scan",
    response_model=ReceiptScanRead,
    responses=_NOT_FOUND,
)
async def scan_receipt(
    file: Annotated[UploadFile, File()],
    user: UserDep,
    db: DbSession,
):
    try:
        content = await file.read()
        if len(content) > settings.receipt_scan_max_bytes:
            raise HTTPException(
                status_code=413,
                detail="Image trop volumineuse",
            )
        return await receipt_service.scan_receipt(
            user.id, content, file.content_type, db,
        )
    finally:
        await file.close()
