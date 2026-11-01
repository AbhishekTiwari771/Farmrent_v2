from app.schemas.recommendation import Recommendation, RecommendationRequest

def slug(value: str) -> str:
    return "-".join(value.casefold().replace("&", "and").split()).replace("_", "-")


crop_equipment = {
    "wheat": {"tractors", "seed-drills", "harvesters", "sprayers"},
    "rice": {"tractors", "rice-transplanters", "harvesters", "irrigation-equipment"},
    "paddy": {"tractors", "rice-transplanters", "harvesters", "irrigation-equipment"},
    "maize": {"tractors", "precision-planters", "harvesters", "sprayers"},
    "corn": {"tractors", "precision-planters", "harvesters", "sprayers"},
    "cotton": {"tractors", "cultivators", "sprayers", "harvesters"},
    "soybean": {"tractors", "seed-drills", "harvesters", "sprayers"},
    "sugarcane": {"tractors", "sugarcane-equipment", "cultivators"},
}


def rank_equipment(request: RecommendationRequest, listings: list[dict]) -> list[Recommendation]:
    """Rank only records supplied by the marketplace; never invent availability or prices."""
    candidates = []
    for item in listings:
        rate = float(item["dailyRate"])
        if request.budget_per_day is not None and rate > request.budget_per_day:
            continue
        item_category = slug(item.get("category", ""))
        requested_category = slug(request.category) if request.category else None
        if requested_category and requested_category not in item_category:
            continue
        score = 0.45
        reasons = []
        category = item.get("category", "")
        if requested_category and requested_category in item_category:
            score += 0.25
            reasons.append(f"matches {category}")
        if request.crop and item_category in crop_equipment.get(request.crop.casefold(), set()):
            score += 0.15
            reasons.append(f"commonly used for {request.crop}")
        if request.district and request.district.casefold() in item.get("district", "").casefold():
            score += 0.2
            reasons.append(f"listed near {request.district}")
        if request.budget_per_day:
            score += 0.1 * (1 - rate / request.budget_per_day)
            reasons.append("within your daily budget")
        if request.land_acres <= 5 and category.casefold() in {"tractors", "rotavators", "seed drills", "cultivators"}:
            score += 0.05
            reasons.append("a commonly used option for smaller plots")
        explanation = ", ".join(reasons) or "Active FarmRent marketplace listing that may suit your requirements."
        candidates.append(Recommendation(
            equipment_id=str(item["id"]), name=item["name"], daily_rate_inr=rate,
            score=min(1.0, max(0.0, score)),
            explanation=explanation + ". Confirm machine capacity and rental dates with the owner.",
        ))
    return sorted(candidates, key=lambda x: x.score, reverse=True)[:5]
