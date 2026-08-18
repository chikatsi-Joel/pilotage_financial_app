from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.base import ORMModel


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    currency: str = Field(default="XAF", min_length=3, max_length=3)


class UserRead(ORMModel):
    id: UUID
    name: str
    currency: str
