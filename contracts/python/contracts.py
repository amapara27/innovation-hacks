"""
╔═══════════════════════════════════════════════════════════════════════════╗
║  CarbonIQ — Python Contracts (Pydantic)                                  ║
║  MIRROR of @carboniq/contracts TypeScript package.                       ║
║  AI Backend MUST use these models for all API request/response shapes.   ║
║                                                                          ║
║  ⚠ DO NOT modify field names or enum values without updating the         ║
║    corresponding TypeScript contracts in contracts/src/                   ║
╚═══════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════════════════════
#  ENUMS — must match contracts/src/enums.ts exactly
# ═══════════════════════════════════════════════════════════════════════════

class EmissionCategory(str, Enum):
    TRANSPORTATION = "transportation"
    FOOD_DINING = "food_dining"
    GROCERIES = "groceries"
    UTILITIES = "utilities"
    SHOPPING = "shopping"
    TRAVEL = "travel"
    GAS_FUEL = "gas_fuel"
    HOME = "home"
    ENTERTAINMENT = "entertainment"
    HEALTH = "health"
    OTHER = "other"


class CarbonCreditType(str, Enum):
    RENEWABLE_ENERGY = "renewable_energy"
    FORESTRY = "forestry"
    METHANE_CAPTURE = "methane_capture"
    DIRECT_AIR_CAPTURE = "direct_air_capture"
    SOIL_CARBON = "soil_carbon"
    OCEAN_BASED = "ocean_based"


class OffsetStatus(str, Enum):
    PENDING = "pending"
    PURCHASED = "purchased"
    RECORDED_ON_CHAIN = "recorded_on_chain"
    FAILED = "failed"


class GreenScoreTier(str, Enum):
    SEEDLING = "seedling"
    SPROUT = "sprout"
    TREE = "tree"
    FOREST = "forest"
    EARTH_GUARDIAN = "earth_guardian"


class NftRarity(str, Enum):
    COMMON = "common"
    UNCOMMON = "uncommon"
    RARE = "rare"
    EPIC = "epic"
    LEGENDARY = "legendary"


class SwapDifficulty(str, Enum):
    EASY = "easy"
    MODERATE = "moderate"
    HARD = "hard"


# ═══════════════════════════════════════════════════════════════════════════
#  CONSTANTS — must match contracts/src/constants.ts exactly
# ═══════════════════════════════════════════════════════════════════════════

GREEN_SCORE_MIN = 0
GREEN_SCORE_MAX = 100

GREEN_SCORE_WEIGHTS = {
    "transactionEfficiency": 0.25,
    "spendingHabits": 0.25,
    "carbonOffsets": 0.30,
    "communityImpact": 0.20,
}

GREEN_SCORE_TIER_THRESHOLDS = {
    "seedling": {"min": 0, "max": 24},
    "sprout": {"min": 25, "max": 49},
    "tree": {"min": 50, "max": 74},
    "forest": {"min": 75, "max": 89},
    "earth_guardian": {"min": 90, "max": 100},
}

STAKING_BASE_APY = 6.5
STAKING_GREEN_BONUS_MAX = 2.5
STAKING_MAX_AMOUNT = 1_000_000
STAKING_MAX_DURATION_DAYS = 365

OFFSET_MIN_GRAMS = 1
OFFSET_MAX_GRAMS = 1_000_000_000  # 1,000 tonnes

DEFAULT_TRANSACTION_LIMIT = 20
MAX_TRANSACTION_LIMIT = 100

SWAP_SUGGESTIONS_MIN = 3
SWAP_SUGGESTIONS_MAX = 5

LEADERBOARD_PAGE_SIZE = 50

WALLET_ADDRESS_MIN_LENGTH = 32
WALLET_ADDRESS_MAX_LENGTH = 44


# ═══════════════════════════════════════════════════════════════════════════
#  PYDANTIC MODELS — mirrors contracts/src/schemas.ts
# ═══════════════════════════════════════════════════════════════════════════

# ─── POST /api/analyze-transactions ──────────────────────────────────────

class AnalyzeTransactionsRequest(BaseModel):
    wallet: str = Field(..., min_length=WALLET_ADDRESS_MIN_LENGTH, max_length=WALLET_ADDRESS_MAX_LENGTH)
    plaid_access_token: Optional[str] = Field(None, alias="plaidAccessToken")
    limit: int = Field(DEFAULT_TRANSACTION_LIMIT, ge=1, le=MAX_TRANSACTION_LIMIT)


class AnalyzedTransaction(BaseModel):
    transaction_id: str = Field(..., alias="transactionId")
    description: str
    amount_usd: float = Field(..., alias="amountUsd")
    mcc_code: Optional[str] = Field(None, alias="mccCode")
    category: EmissionCategory
    co2e_grams: float = Field(..., ge=0, alias="co2eGrams")
    emission_factor: float = Field(..., ge=0, alias="emissionFactor")
    date: str

    model_config = {"populate_by_name": True}


class AnalyzeTransactionsResponse(BaseModel):
    wallet: str
    transaction_count: int = Field(..., ge=0, alias="transactionCount")
    total_co2e_grams: float = Field(..., ge=0, alias="totalCo2eGrams")
    category_breakdown: dict[EmissionCategory, float] = Field(..., alias="categoryBreakdown")
    transactions: list[AnalyzedTransaction]
    analyzed_at: str = Field(..., alias="analyzedAt")

    model_config = {"populate_by_name": True}


# ─── GET /api/green-score ────────────────────────────────────────────────

class GreenScoreRequest(BaseModel):
    wallet: str = Field(..., min_length=WALLET_ADDRESS_MIN_LENGTH, max_length=WALLET_ADDRESS_MAX_LENGTH)


class GreenScoreBreakdown(BaseModel):
    transaction_efficiency: float = Field(..., ge=0, le=100, alias="transactionEfficiency")
    spending_habits: float = Field(..., ge=0, le=100, alias="spendingHabits")
    carbon_offsets: float = Field(..., ge=0, le=100, alias="carbonOffsets")
    community_impact: float = Field(..., ge=0, le=100, alias="communityImpact")

    model_config = {"populate_by_name": True}


class GreenScoreResponse(BaseModel):
    wallet: str
    score: float = Field(..., ge=GREEN_SCORE_MIN, le=GREEN_SCORE_MAX)
    tier: GreenScoreTier
    breakdown: GreenScoreBreakdown
    rank: Optional[int] = Field(None, gt=0)
    total_users: Optional[int] = Field(None, ge=0, alias="totalUsers")

    model_config = {"populate_by_name": True}


# ─── GET /api/swap-suggestions ───────────────────────────────────────────

class SwapSuggestionsRequest(BaseModel):
    wallet: str = Field(..., min_length=WALLET_ADDRESS_MIN_LENGTH, max_length=WALLET_ADDRESS_MAX_LENGTH)
    categories: Optional[list[EmissionCategory]] = None


class SwapSuggestion(BaseModel):
    current_category: EmissionCategory = Field(..., alias="currentCategory")
    current_description: str = Field(..., alias="currentDescription")
    current_co2e_monthly: float = Field(..., ge=0, alias="currentCo2eMonthly")
    alternative_description: str = Field(..., alias="alternativeDescription")
    alternative_co2e_monthly: float = Field(..., ge=0, alias="alternativeCo2eMonthly")
    co2e_savings_monthly: float = Field(..., ge=0, alias="co2eSavingsMonthly")
    price_difference_usd: float = Field(..., alias="priceDifferenceUsd")
    difficulty: SwapDifficulty

    model_config = {"populate_by_name": True}


class SwapSuggestionsResponse(BaseModel):
    wallet: str
    suggestions: list[SwapSuggestion] = Field(..., min_length=1, max_length=5)
    total_potential_savings_monthly: float = Field(..., ge=0, alias="totalPotentialSavingsMonthly")

    model_config = {"populate_by_name": True}


# ─── POST /api/trigger-offset ────────────────────────────────────────────

class TriggerOffsetRequest(BaseModel):
    wallet: str = Field(..., min_length=WALLET_ADDRESS_MIN_LENGTH, max_length=WALLET_ADDRESS_MAX_LENGTH)
    budget_usd: float = Field(..., gt=0, alias="budgetUsd")
    preferred_credit_type: Optional[CarbonCreditType] = Field(None, alias="preferredCreditType")

    model_config = {"populate_by_name": True}


class OffsetDecision(BaseModel):
    credit_type: CarbonCreditType = Field(..., alias="creditType")
    co2e_grams: float = Field(..., ge=OFFSET_MIN_GRAMS, le=OFFSET_MAX_GRAMS, alias="co2eGrams")
    cost_usd: float = Field(..., ge=0, alias="costUsd")
    price_per_tonne_usd: float = Field(..., gt=0, alias="pricePerTonneUsd")
    project_name: str = Field(..., alias="projectName")
    verification_standard: Optional[str] = Field(None, alias="verificationStandard")

    model_config = {"populate_by_name": True}


class TriggerOffsetResponse(BaseModel):
    wallet: str
    decision: OffsetDecision
    status: OffsetStatus
    toucan_tx_hash: Optional[str] = Field(None, alias="toucanTxHash")

    model_config = {"populate_by_name": True}


# ─── POST /api/record-offset ─────────────────────────────────────────────

class RecordOffsetRequest(BaseModel):
    wallet: str = Field(..., min_length=WALLET_ADDRESS_MIN_LENGTH, max_length=WALLET_ADDRESS_MAX_LENGTH)
    co2e_grams: float = Field(..., ge=OFFSET_MIN_GRAMS, le=OFFSET_MAX_GRAMS, alias="co2eGrams")
    credit_type: CarbonCreditType = Field(..., alias="creditType")
    toucan_tx_hash: Optional[str] = Field(None, alias="toucanTxHash")

    model_config = {"populate_by_name": True}


class RecordOffsetResponse(BaseModel):
    wallet: str
    solana_signature: str = Field(..., alias="solanaSignature")
    proof_of_impact_address: str = Field(..., alias="proofOfImpactAddress")
    cumulative_co2e_grams: float = Field(..., ge=0, alias="cumulativeCo2eGrams")
    status: OffsetStatus

    model_config = {"populate_by_name": True}


# ─── GET /api/staking-info & POST /api/simulate-stake ────────────────────

class StakingInfoRequest(BaseModel):
    wallet: str = Field(..., min_length=WALLET_ADDRESS_MIN_LENGTH, max_length=WALLET_ADDRESS_MAX_LENGTH)


class StakingInfoResponse(BaseModel):
    wallet: str
    green_score: float = Field(..., ge=GREEN_SCORE_MIN, le=GREEN_SCORE_MAX, alias="greenScore")
    base_apy: float = Field(..., alias="baseApy")
    green_bonus: float = Field(..., ge=0, alias="greenBonus")
    effective_apy: float = Field(..., alias="effectiveApy")
    staked_amount: float = Field(..., ge=0, alias="stakedAmount")
    accrued_yield: float = Field(..., ge=0, alias="accruedYield")

    model_config = {"populate_by_name": True}


class SimulateStakeRequest(BaseModel):
    amount: float = Field(..., gt=0, le=STAKING_MAX_AMOUNT)
    duration_days: int = Field(..., ge=1, le=STAKING_MAX_DURATION_DAYS, alias="durationDays")
    green_score: float = Field(..., ge=GREEN_SCORE_MIN, le=GREEN_SCORE_MAX, alias="greenScore")

    model_config = {"populate_by_name": True}


class SimulateStakeResponse(BaseModel):
    principal: float = Field(..., gt=0)
    duration_days: int = Field(..., gt=0, alias="durationDays")
    base_apy: float = Field(..., alias="baseApy")
    green_bonus: float = Field(..., ge=0, alias="greenBonus")
    effective_apy: float = Field(..., alias="effectiveApy")
    estimated_yield: float = Field(..., ge=0, alias="estimatedYield")
    total_return: float = Field(..., gt=0, alias="totalReturn")

    model_config = {"populate_by_name": True}


# ─── GET /api/leaderboard ────────────────────────────────────────────────

class LeaderboardRequest(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=LEADERBOARD_PAGE_SIZE, alias="pageSize")

    model_config = {"populate_by_name": True}


class LeaderboardEntry(BaseModel):
    rank: int = Field(..., gt=0)
    wallet: str
    wallet_short: str = Field(..., alias="walletShort")
    score: float = Field(..., ge=GREEN_SCORE_MIN, le=GREEN_SCORE_MAX)
    tier: GreenScoreTier
    total_co2e_offset: float = Field(..., ge=0, alias="totalCo2eOffset")

    model_config = {"populate_by_name": True}


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]
    total_entries: int = Field(..., ge=0, alias="totalEntries")
    page: int = Field(..., gt=0)
    page_size: int = Field(..., gt=0, alias="pageSize")
    total_pages: int = Field(..., ge=0, alias="totalPages")

    model_config = {"populate_by_name": True}


# ─── Impact NFT Metadata (Metaplex-compatible) ──────────────────────────

class NftAttribute(BaseModel):
    trait_type: str
    value: str | float | int


class NftFile(BaseModel):
    uri: str
    type: str


class NftCreator(BaseModel):
    address: str = Field(..., min_length=WALLET_ADDRESS_MIN_LENGTH, max_length=WALLET_ADDRESS_MAX_LENGTH)
    share: int = Field(..., ge=0, le=100)


class NftProperties(BaseModel):
    category: str = "image"
    files: list[NftFile]
    creators: list[NftCreator]


class ImpactNftMetadata(BaseModel):
    name: str
    symbol: str = "CIQNFT"
    description: str
    image: str
    external_url: Optional[str] = None
    attributes: list[NftAttribute]
    properties: NftProperties
