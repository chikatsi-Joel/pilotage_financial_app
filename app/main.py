from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers import (
    ai,
    analytics,
    budget,
    expenses,
    incomes,
    master_data,
    savings,
    users,
    what_if,
)
from app.core.config import settings
from app.db.session import get_engine

app = FastAPI(
    title="Personal Finance Pilotage API",
    version="1.0.0",
    description="Backend FastAPI du pilotage personnalisé des finances personnelles.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router, prefix="/api/v1")
app.include_router(master_data.router, prefix="/api/v1")
app.include_router(incomes.router, prefix="/api/v1")
app.include_router(expenses.router, prefix="/api/v1")
app.include_router(savings.router, prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(budget.router, prefix="/api/v1")
app.include_router(what_if.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1")


@app.get("/health", tags=["system"])
async def health():
    async with AsyncSession(get_engine()) as session:
        await session.execute(text("SELECT 1"))
    return {"status": "ok"}
