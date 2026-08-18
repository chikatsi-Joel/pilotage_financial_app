from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.base import ORMModel


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    essentiality: str
    optimization_potential: str


class CategoryRead(ORMModel):
    id: UUID
    name: str
    category_type: str
    essentiality: str
    optimization_potential: str
    active: bool


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    essentiality: str | None = None
    optimization_potential: str | None = None
    active: bool | None = None
