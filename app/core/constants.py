"""Deterministic rule tables shared across backend services."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from contracts.python.contracts import CarbonCreditType, EmissionCategory, SwapDifficulty

from app.models.domain import CreditProjectProfile, MerchantTemplate, SuggestionRule

REFERENCE_ANALYZED_AT = "2026-01-31T12:00:00Z"
LEDGER_END = datetime(2026, 1, 31, 12, 0, tzinfo=UTC)
LEDGER_INTERVAL_HOURS = 7

CATEGORY_ORDER = list(EmissionCategory)
CATEGORY_ORDER_INDEX = {category: index for index, category in enumerate(CATEGORY_ORDER)}

EMISSION_FACTORS = {
    EmissionCategory.TRANSPORTATION: Decimal("260"),
    EmissionCategory.FOOD_DINING: Decimal("150"),
    EmissionCategory.GROCERIES: Decimal("90"),
    EmissionCategory.UTILITIES: Decimal("230"),
    EmissionCategory.SHOPPING: Decimal("180"),
    EmissionCategory.TRAVEL: Decimal("480"),
    EmissionCategory.GAS_FUEL: Decimal("350"),
    EmissionCategory.HOME: Decimal("140"),
    EmissionCategory.ENTERTAINMENT: Decimal("70"),
    EmissionCategory.HEALTH: Decimal("60"),
    EmissionCategory.OTHER: Decimal("120"),
}

MCC_CATEGORY_MAP = {
    "4111": EmissionCategory.TRANSPORTATION,
    "4121": EmissionCategory.TRANSPORTATION,
    "4131": EmissionCategory.TRANSPORTATION,
    "4511": EmissionCategory.TRAVEL,
    "4722": EmissionCategory.TRAVEL,
    "7011": EmissionCategory.TRAVEL,
    "5411": EmissionCategory.GROCERIES,
    "5499": EmissionCategory.GROCERIES,
    "5812": EmissionCategory.FOOD_DINING,
    "5814": EmissionCategory.FOOD_DINING,
    "4900": EmissionCategory.UTILITIES,
    "5200": EmissionCategory.HOME,
    "5211": EmissionCategory.HOME,
    "5712": EmissionCategory.HOME,
    "5311": EmissionCategory.SHOPPING,
    "5941": EmissionCategory.SHOPPING,
    "5942": EmissionCategory.SHOPPING,
    "5541": EmissionCategory.GAS_FUEL,
    "5542": EmissionCategory.GAS_FUEL,
    "7832": EmissionCategory.ENTERTAINMENT,
    "4899": EmissionCategory.ENTERTAINMENT,
    "5912": EmissionCategory.HEALTH,
    "8099": EmissionCategory.HEALTH,
}

KEYWORD_CATEGORY_MAP: list[tuple[tuple[str, ...], EmissionCategory]] = [
    (("uber", "lyft", "metro", "transit", "commuter"), EmissionCategory.TRANSPORTATION),
    (("air", "airlines", "flight", "hotel", "marriott", "delta"), EmissionCategory.TRAVEL),
    (("whole foods", "trader joe", "market", "grocer", "produce"), EmissionCategory.GROCERIES),
    (("coffee", "sweetgreen", "restaurant", "cafe", "lunch"), EmissionCategory.FOOD_DINING),
    (("utility", "energy", "electric", "water", "pge"), EmissionCategory.UTILITIES),
    (("amazon", "rei", "marketplace", "store"), EmissionCategory.SHOPPING),
    (("shell", "chevron", "fuel", "gas"), EmissionCategory.GAS_FUEL),
    (("home depot", "ikea", "furnishings", "hardware"), EmissionCategory.HOME),
    (("spotify", "netflix", "movie", "theatre", "ticket"), EmissionCategory.ENTERTAINMENT),
    (("cvs", "pharmacy", "kaiser", "clinic"), EmissionCategory.HEALTH),
]

SUSTAINABILITY_POINTS = {
    EmissionCategory.GROCERIES: Decimal("85"),
    EmissionCategory.HEALTH: Decimal("80"),
    EmissionCategory.ENTERTAINMENT: Decimal("70"),
    EmissionCategory.HOME: Decimal("65"),
    EmissionCategory.FOOD_DINING: Decimal("55"),
    EmissionCategory.OTHER: Decimal("50"),
    EmissionCategory.SHOPPING: Decimal("45"),
    EmissionCategory.UTILITIES: Decimal("40"),
    EmissionCategory.TRANSPORTATION: Decimal("35"),
    EmissionCategory.GAS_FUEL: Decimal("20"),
    EmissionCategory.TRAVEL: Decimal("15"),
}

ESSENTIAL_CATEGORIES = {
    EmissionCategory.GROCERIES,
    EmissionCategory.FOOD_DINING,
    EmissionCategory.HOME,
    EmissionCategory.HEALTH,
}

CREDIT_PROFILES = {
    CarbonCreditType.RENEWABLE_ENERGY: CreditProjectProfile(
        price_per_tonne_usd=Decimal("18"),
        project_name="Karnataka Solar Farm Portfolio",
        verification_standard="Gold Standard",
    ),
    CarbonCreditType.FORESTRY: CreditProjectProfile(
        price_per_tonne_usd=Decimal("14"),
        project_name="Keo Seima Forest Conservation",
        verification_standard="Verra VCS",
    ),
    CarbonCreditType.METHANE_CAPTURE: CreditProjectProfile(
        price_per_tonne_usd=Decimal("16"),
        project_name="Apex Regional Landfill Gas Recovery",
        verification_standard="Verra VCS",
    ),
    CarbonCreditType.DIRECT_AIR_CAPTURE: CreditProjectProfile(
        price_per_tonne_usd=Decimal("220"),
        project_name="Mammoth Direct Air Capture Plant",
        verification_standard="Puro.earth",
    ),
    CarbonCreditType.SOIL_CARBON: CreditProjectProfile(
        price_per_tonne_usd=Decimal("22"),
        project_name="Northern Plains Regenerative Soil Project",
        verification_standard="Climate Action Reserve",
    ),
    CarbonCreditType.OCEAN_BASED: CreditProjectProfile(
        price_per_tonne_usd=Decimal("35"),
        project_name="British Columbia Kelp Restoration Initiative",
        verification_standard="Verra VCS",
    ),
}

DOMINANT_CATEGORY_CREDIT_MAP = {
    EmissionCategory.TRAVEL: CarbonCreditType.RENEWABLE_ENERGY,
    EmissionCategory.GAS_FUEL: CarbonCreditType.RENEWABLE_ENERGY,
    EmissionCategory.UTILITIES: CarbonCreditType.RENEWABLE_ENERGY,
    EmissionCategory.TRANSPORTATION: CarbonCreditType.RENEWABLE_ENERGY,
    EmissionCategory.GROCERIES: CarbonCreditType.SOIL_CARBON,
    EmissionCategory.FOOD_DINING: CarbonCreditType.SOIL_CARBON,
    EmissionCategory.HOME: CarbonCreditType.SOIL_CARBON,
    EmissionCategory.SHOPPING: CarbonCreditType.METHANE_CAPTURE,
    EmissionCategory.ENTERTAINMENT: CarbonCreditType.METHANE_CAPTURE,
    EmissionCategory.OTHER: CarbonCreditType.METHANE_CAPTURE,
    EmissionCategory.HEALTH: CarbonCreditType.FORESTRY,
}

SUGGESTION_RULES = {
    EmissionCategory.TRANSPORTATION: SuggestionRule(
        alternative_share=Decimal("0.55"),
        price_difference_usd=Decimal("-20"),
        difficulty=SwapDifficulty.MODERATE,
        current_description="Frequent rideshare and car-based commuting",
        alternative_description="Shift recurring trips to public transit, biking, or walking",
    ),
    EmissionCategory.FOOD_DINING: SuggestionRule(
        alternative_share=Decimal("0.40"),
        price_difference_usd=Decimal("-35"),
        difficulty=SwapDifficulty.EASY,
        current_description="Regular takeout and restaurant-heavy meals",
        alternative_description="Batch more home-cooked meals with lower-emission ingredients",
    ),
    EmissionCategory.GROCERIES: SuggestionRule(
        alternative_share=Decimal("0.80"),
        price_difference_usd=Decimal("10"),
        difficulty=SwapDifficulty.EASY,
        current_description="A grocery basket with mixed conventional choices",
        alternative_description="Lean into seasonal and plant-forward grocery staples",
    ),
    EmissionCategory.UTILITIES: SuggestionRule(
        alternative_share=Decimal("0.65"),
        price_difference_usd=Decimal("15"),
        difficulty=SwapDifficulty.MODERATE,
        current_description="A household utility profile with limited efficiency upgrades",
        alternative_description="Use a renewable utility plan and tighten energy usage",
    ),
    EmissionCategory.SHOPPING: SuggestionRule(
        alternative_share=Decimal("0.55"),
        price_difference_usd=Decimal("-25"),
        difficulty=SwapDifficulty.EASY,
        current_description="New-product shopping across general retail",
        alternative_description="Delay low-priority purchases and choose secondhand where possible",
    ),
    EmissionCategory.TRAVEL: SuggestionRule(
        alternative_share=Decimal("0.40"),
        price_difference_usd=Decimal("40"),
        difficulty=SwapDifficulty.HARD,
        current_description="Air and hotel spend that signals frequent travel",
        alternative_description="Consolidate trips and replace some flights with virtual or rail alternatives",
    ),
    EmissionCategory.GAS_FUEL: SuggestionRule(
        alternative_share=Decimal("0.45"),
        price_difference_usd=Decimal("25"),
        difficulty=SwapDifficulty.MODERATE,
        current_description="Recurring gasoline purchases for personal driving",
        alternative_description="Combine errands and shift some miles to lower-emission transport",
    ),
    EmissionCategory.HOME: SuggestionRule(
        alternative_share=Decimal("0.70"),
        price_difference_usd=Decimal("60"),
        difficulty=SwapDifficulty.HARD,
        current_description="Home improvement and furnishing spend with embedded emissions",
        alternative_description="Prioritize durable upgrades and buy fewer, longer-lasting home items",
    ),
    EmissionCategory.ENTERTAINMENT: SuggestionRule(
        alternative_share=Decimal("0.75"),
        price_difference_usd=Decimal("-10"),
        difficulty=SwapDifficulty.EASY,
        current_description="Entertainment spending centered on venue-based activities",
        alternative_description="Swap in lower-impact local or at-home entertainment more often",
    ),
    EmissionCategory.HEALTH: SuggestionRule(
        alternative_share=Decimal("0.85"),
        price_difference_usd=Decimal("-5"),
        difficulty=SwapDifficulty.EASY,
        current_description="Health-related purchases with some avoidable delivery or convenience overhead",
        alternative_description="Bundle routine health purchases and choose local pickup when practical",
    ),
    EmissionCategory.OTHER: SuggestionRule(
        alternative_share=Decimal("0.80"),
        price_difference_usd=Decimal("0"),
        difficulty=SwapDifficulty.EASY,
        current_description="Miscellaneous spending without a lower-carbon plan",
        alternative_description="Audit recurring miscellaneous purchases and trim the least valuable ones",
    ),
}

MERCHANT_CATALOG = [
    MerchantTemplate("Uber Trip", "4121", 1800, 2600),
    MerchantTemplate("Lyft Ride", "4121", 1600, 2400),
    MerchantTemplate("City Metro Pass", "4111", 950, 1200),
    MerchantTemplate("Whole Foods Market", "5411", 4200, 3800),
    MerchantTemplate("Trader Joe's", "5411", 3100, 2600),
    MerchantTemplate("Blue Bottle Coffee", "5814", 900, 1100),
    MerchantTemplate("Sweetgreen Lunch", "5812", 1250, 1450),
    MerchantTemplate("PG&E Energy Bill", "4900", 7800, 6200),
    MerchantTemplate("Water Utility Services", "4900", 5200, 3000),
    MerchantTemplate("Amazon Marketplace", "5311", 2400, 5400),
    MerchantTemplate("REI Co-op", "5941", 3500, 6800),
    MerchantTemplate("Delta Air Lines", "4511", 16500, 22000),
    MerchantTemplate("Marriott Hotel", "7011", 9800, 16000),
    MerchantTemplate("Shell Fuel Station", "5541", 4200, 3200),
    MerchantTemplate("Chevron Gas", "5541", 3800, 2800),
    MerchantTemplate("Home Depot", "5200", 5400, 9200),
    MerchantTemplate("IKEA Home Furnishings", "5712", 6200, 9800),
    MerchantTemplate("AMC Theatres", "7832", 1800, 2200),
    MerchantTemplate("Spotify Premium", None, 1100, 400),
    MerchantTemplate("CVS Pharmacy", "5912", 1800, 2600),
    MerchantTemplate("Kaiser Permanente", "8099", 4200, 6800),
    MerchantTemplate("Neighborhood Farmers Market", None, 2800, 2400),
    MerchantTemplate("Netflix Subscription", None, 1500, 400),
    MerchantTemplate("Organic Produce Box", None, 3600, 2200),
]
