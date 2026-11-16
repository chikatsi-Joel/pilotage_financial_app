from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

_engine: AsyncEngine | None = None
_SessionLocal: async_sessionmaker[AsyncSession] | None = None

def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        # Pool borné (5 + 5) : un seul worker uvicorn sur une petite VM ; au-delà, une requête
        # attend une connexion (30 s max) au lieu d'ouvrir des connexions Postgres sans fin.
        _engine = create_async_engine(
            settings.database_url,
            pool_pre_ping=True,
            future=True,
            **(
                {"pool_size": 5, "max_overflow": 5, "pool_timeout": 30}
                if settings.database_url.startswith("postgresql")
                else {}
            ),
        )
    return _engine

def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = async_sessionmaker(get_engine(), class_=AsyncSession, expire_on_commit=False)
    return _SessionLocal

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with get_session_factory()() as session:
        yield session
