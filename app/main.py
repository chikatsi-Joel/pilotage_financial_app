import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers import (
    admin,
    ai,
    analytics,
    auth,
    budget,
    expenses,
    incomes,
    master_data,
    notifications,
    receipts,
    savings,
    users,
    what_if,
)
from app.api.errors import register_error_handlers
from app.core.config import settings
from app.db.session import get_engine
from app.services import notification_service

@asynccontextmanager
async def lifespan(_: FastAPI):
    tasks: list[asyncio.Task] = []
    if settings.scheduler_enabled and settings.push_enabled:
        tasks.append(asyncio.create_task(notification_service.scheduler_loop()))
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()


app = FastAPI(
    title="Lucia API",
    version="1.0.0",
    description="Backend FastAPI de Lucia, assistant de pilotage des finances personnelles.",
    lifespan=lifespan,
)
register_error_handlers(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(master_data.router, prefix="/api/v1")
app.include_router(incomes.router, prefix="/api/v1")
app.include_router(expenses.router, prefix="/api/v1")
app.include_router(savings.router, prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(budget.router, prefix="/api/v1")
app.include_router(what_if.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1")
app.include_router(receipts.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(admin.router)

# Backoffice (pages compilées de backoffice/ dans static/admin) : toute route inconnue sous
# /admin renvoie index.html (navigation côté client).
ADMIN_DIR = Path(__file__).resolve().parent.parent / "static" / "admin"


@app.get("/admin", include_in_schema=False)
@app.get("/admin/{path:path}", include_in_schema=False)
async def admin_app(path: str = ""):
    if path.startswith("api/"):
        raise HTTPException(status_code=404)
    candidate = (ADMIN_DIR / path).resolve()
    if path and candidate.is_file() and ADMIN_DIR in candidate.parents:
        return FileResponse(candidate)
    index = ADMIN_DIR / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=404, detail="Backoffice non compilé (npm run build dans backoffice/)")
    return FileResponse(index, headers={"Cache-Control": "no-cache"})


@app.get("/health", tags=["system"])
async def health():
    async with AsyncSession(get_engine()) as session:
        await session.execute(text("SELECT 1"))
    return {"status": "ok"}
