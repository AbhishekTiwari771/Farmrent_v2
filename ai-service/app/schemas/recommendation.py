from typing import Literal
from pydantic import BaseModel, Field


class RecommendationRequest(BaseModel):
    category: str | None = None
    crop: str | None = None
    land_acres: float = Field(gt=0, le=10000)
    district: str | None = None
    budget_per_day: float | None = Field(default=None, gt=0)
    soil_type: str | None = None
    activity: str | None = None


class Recommendation(BaseModel):
    equipment_id: str
    name: str
    daily_rate_inr: float
    score: float = Field(ge=0, le=1)
    explanation: str


class RecommendationResponse(BaseModel):
    recommendations: list[Recommendation]
    source: str


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1000)


class AssistantRequest(BaseModel):
    message: str = Field(min_length=2, max_length=1000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=8)


class AssistantResponse(BaseModel):
    message: str
    recommendations: list[Recommendation] = Field(default_factory=list)
    source: str
    mode: Literal["llm", "grounded_fallback"] = "grounded_fallback"
