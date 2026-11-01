import os
import re
import json
import secrets

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.schemas.recommendation import (AssistantRequest, AssistantResponse, RecommendationRequest,
                                        RecommendationResponse)
from app.services.recommender import rank_equipment

load_dotenv()

app = FastAPI(title="FarmRent AI", version="0.1.0", description="Marketplace-grounded agricultural equipment recommendations")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("AI_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001").split(","), allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
MARKETPLACE_URL = os.getenv("FARMRENT_API_URL", "http://localhost:4000/api/v1").rstrip("/")


def require_internal_key(value: str | None = Header(default=None, alias="X-FarmRent-AI-Key")) -> None:
    expected = os.getenv("AI_SERVICE_API_KEY", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="AI service authentication is not configured")
    if not value or not secrets.compare_digest(value, expected):
        raise HTTPException(status_code=401, detail="Unauthorized AI service request")


def get_listings(params: dict | None = None) -> list[dict]:
    try:
        response = httpx.get(f"{MARKETPLACE_URL}/equipment", params={"limit": 48, **(params or {})}, timeout=8)
        response.raise_for_status()
        return response.json().get("data", [])
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="FarmRent marketplace is temporarily unavailable. Please try again shortly.") from exc


def generate_llm_answer(request: AssistantRequest, listings: list[dict]) -> str | None:
    api_key = os.getenv("AI_API_KEY", "").strip()
    if not api_key:
        return None
    base_url = os.getenv("AI_API_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = os.getenv("AI_MODEL", "gpt-4.1-mini")
    safe_listings = [{key: item.get(key) for key in ("id", "name", "brand", "model", "category", "district", "state", "dailyRate", "condition", "isSeededDemo")} for item in listings[:5]]
    instructions = (
        "You are FarmRent's agricultural equipment rental assistant for farmers in India. "
        "Answer warmly and concisely. Use only the supplied FarmRent listings for equipment names, prices, locations, ratings, owner verification, or availability. "
        "Never invent a listing or claim dates are available; dates are confirmed at checkout. "
        "If the supplied listings do not answer a marketplace question, say so and suggest a search. "
        "Give general farming guidance with uncertainty, ask a brief follow-up when needed, and do not present crop or machine advice as a guaranteed diagnosis. "
        "Explain that demo listings and their sample rates may be fictional when relevant."
    )
    context = "Current active FarmRent listings relevant to this message (authoritative data):\n" + json.dumps(safe_listings, ensure_ascii=False)
    messages = [{"role": turn.role, "content": turn.content} for turn in request.history[-8:]]
    messages.append({"role": "user", "content": request.message})
    try:
        response = httpx.post(
            f"{base_url}/responses",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "instructions": instructions + "\n\n" + context, "input": messages, "max_output_tokens": 350, "store": False},
            timeout=25,
        )
        response.raise_for_status()
        body = response.json()
        answer = body.get("output_text")
        if not answer:
            answer = "\n".join(block.get("text", "") for item in body.get("output", []) for block in item.get("content", []) if block.get("type") in ("output_text", "text"))
        if not answer.strip():
            raise ValueError("The AI provider returned an empty response")
        return answer.strip()
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="The AI provider could not complete this response. Check the server-side API key, base URL, and model settings.") from exc


@app.get("/health")
def health():
    return {"status": "ok", "service": "farmrent-ai"}


@app.post("/api/v1/recommendations", response_model=RecommendationResponse, dependencies=[Depends(require_internal_key)])
def recommendations(request: RecommendationRequest):
    listings = get_listings()
    normalized = [{**item, "category": item.get("category", {}).get("name", ""), "district": item.get("district", "")} for item in listings]
    return RecommendationResponse(recommendations=rank_equipment(request, normalized), source="live_marketplace")


@app.post("/api/v1/assistant/chat", response_model=AssistantResponse, dependencies=[Depends(require_internal_key)])
def assistant_chat(request: AssistantRequest):
    text = request.message.strip()
    lower = text.casefold()
    categories = {
        "tractors": ("tractor",), "harvesters": ("harvester", "combine"), "rotavators": ("rotavator", "rotavator"),
        "seed-drills": ("seed drill", "seed-drill", "planter"), "sprayers": ("sprayer", "spray"),
        "cultivators": ("cultivator",), "threshers": ("thresher",), "irrigation-equipment": ("irrigation", "pump"),
    }
    category = next((name for name, words in categories.items() if any(word in lower for word in words)), None)
    budget_match = re.search(r"(?:under|below|within|budget(?: of)?|less than)\s*₹?\s*([\d,]+)", lower)
    budget = float(budget_match.group(1).replace(",", "")) if budget_match else None
    acreage_match = re.search(r"([\d.]+)\s*(?:acre|acres|bigha)", lower)
    acres = float(acreage_match.group(1)) if acreage_match else 5.0
    listings = get_listings({"category": category} if category else None)
    known_locations = sorted({item.get("district", "") for item in listings if item.get("district")}, key=len, reverse=True)
    district = next((location for location in known_locations if location.casefold() in lower), None)
    crop = next((name for name in ("wheat", "rice", "paddy", "maize", "corn", "cotton", "soybean", "sugarcane") if name in lower), None)
    if budget_match:
        filtered = [item for item in listings if float(item.get("dailyRate", 0)) <= budget]
        listings = filtered
    candidate_listings = [{**item, "category": item.get("category", {}).get("name", ""), "district": item.get("district", "")} for item in listings]
    if district:
        candidate_listings.sort(key=lambda item: district.casefold() not in item["district"].casefold())
    request_data = RecommendationRequest(category=category, crop=crop, land_acres=acres, district=district, budget_per_day=budget)
    ranked = rank_equipment(request_data, candidate_listings)
    fallback_answer = ""
    if any(word in lower for word in ("booking", "book", "payment", "cancel", "refund")):
        fallback_answer = "To rent equipment, open a listing, choose your dates and handover option, then continue to secure payment. Your booking appears under My bookings after FarmRent verifies payment. Date availability is checked again during checkout."
    elif ranked:
        names = ", ".join(item.name for item in ranked[:3])
        fallback_answer = f"I found {len(ranked)} active listing(s) in FarmRent’s current marketplace{f' for {crop}' if crop else ''}. Good matches: {names}. Prices and names below come from live listings; check dates and machine suitability with each owner before booking."
    else:
        fallback_answer = "I couldn’t find an active listing matching those requirements in the current FarmRent marketplace. Try a wider location, a different equipment type, or a higher daily budget."
    ranked_ids = {item.equipment_id for item in ranked}
    selected_listings = [item for item in candidate_listings if str(item.get("id")) in ranked_ids]
    llm_answer = generate_llm_answer(request, selected_listings)
    return AssistantResponse(message=llm_answer or fallback_answer, recommendations=ranked, source="live_marketplace", mode="llm" if llm_answer else "grounded_fallback")
