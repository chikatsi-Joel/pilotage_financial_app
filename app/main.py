import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers import (
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
    task = (
        asyncio.create_task(notification_service.scheduler_loop())
        if settings.scheduler_enabled and settings.push_enabled
        else None
    )
    try:
        yield
    finally:
        if task:
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


@app.get("/health", tags=["system"])
async def health():
    async with AsyncSession(get_engine()) as session:
        await session.execute(text("SELECT 1"))
    return {"status": "ok"}
