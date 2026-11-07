"""Traduction centralisée des erreurs métier en réponses HTTP."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.services.errors import ServiceError


async def _service_error_handler(_: Request, exc: ServiceError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ServiceError, _service_error_handler)
