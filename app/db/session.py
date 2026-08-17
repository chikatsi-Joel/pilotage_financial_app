from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

_engine: AsyncEngine | None = None
_SessionLocal: async_sessionmaker[AsyncSession] | None = None

def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(settings.database_url, pool_pre_ping=True, future=True)
    return _engine

def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = async_sessionmaker(get_engine(), class_=AsyncSession, expire_on_commit=False)
    return _SessionLocal

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with get_session_factory()() as session:
        yield session
