import {
  CarbonCreditType,
  EmissionCategory,
  type AnalyzeTransactionsResponse,
  type CarbonCreditType as CarbonCreditTypeValue,
  type SwapSuggestion,
} from "@carboniq/contracts";

export type EmissionCategoryValue =
  (typeof EmissionCategory)[keyof typeof EmissionCategory];
export type SwapDifficultyValue = SwapSuggestion["difficulty"];

export type RawTransaction = {
  transactionId: string;
  description: string;
  amountUsd: number;
  mccCode?: string;
  date: string;
};

export type AnalysisSnapshot = {
  response: AnalyzeTransactionsResponse;
  totalSpendUsd: number;
  totalCo2eGrams: number;
  categorySpendTotals: Record<EmissionCategoryValue, number>;
  categoryEmissionTotals: Record<EmissionCategoryValue, number>;
};

type CreditProjectProfile = {
  pricePerTonneUsd: number;
  projectName: string;
  verificationStandard: string;
};

type SuggestionRule = {
  alternativeShare: number;
  priceDifferenceUsd: number;
  difficulty: SwapDifficultyValue;
  currentDescription: string;
  alternativeDescription: string;
};

type MerchantTemplate = {
  description: string;
  mccCode?: string;
  baseAmountCents: number;
  spreadCents: number;
};

export const REFERENCE_ANALYZED_AT = "2026-01-31T12:00:00Z";
export const LEDGER_END = new Date(REFERENCE_ANALYZED_AT);
export const LEDGER_INTERVAL_HOURS = 7;

export const CATEGORY_ORDER: EmissionCategoryValue[] = [
  EmissionCategory.TRANSPORTATION,
  EmissionCategory.FOOD_DINING,
  EmissionCategory.GROCERIES,
  EmissionCategory.UTILITIES,
  EmissionCategory.SHOPPING,
  EmissionCategory.TRAVEL,
  EmissionCategory.GAS_FUEL,
  EmissionCategory.HOME,
  EmissionCategory.ENTERTAINMENT,
  EmissionCategory.HEALTH,
  EmissionCategory.OTHER,
];

export const CATEGORY_ORDER_INDEX = Object.fromEntries(
  CATEGORY_ORDER.map((category, index) => [category, index])
) as Record<EmissionCategoryValue, number>;

export const EMISSION_FACTORS: Record<EmissionCategoryValue, number> = {
  [EmissionCategory.TRANSPORTATION]: 260,
  [EmissionCategory.FOOD_DINING]: 150,
  [EmissionCategory.GROCERIES]: 90,
  [EmissionCategory.UTILITIES]: 230,
  [EmissionCategory.SHOPPING]: 180,
  [EmissionCategory.TRAVEL]: 480,
  [EmissionCategory.GAS_FUEL]: 350,
  [EmissionCategory.HOME]: 140,
  [EmissionCategory.ENTERTAINMENT]: 70,
  [EmissionCategory.HEALTH]: 60,
  [EmissionCategory.OTHER]: 120,
};

export const MCC_CATEGORY_MAP: Record<string, EmissionCategoryValue> = {
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
};

export const KEYWORD_CATEGORY_MAP: ReadonlyArray<
  readonly [readonly string[], EmissionCategoryValue]
> = [
  [
    ["uber", "lyft", "metro", "transit", "commuter"],
    EmissionCategory.TRANSPORTATION,
  ],
  [
    ["air", "airlines", "flight", "hotel", "marriott", "delta"],
    EmissionCategory.TRAVEL,
  ],
  [
    ["whole foods", "trader joe", "market", "grocer", "produce"],
    EmissionCategory.GROCERIES,
  ],
  [
    ["coffee", "sweetgreen", "restaurant", "cafe", "lunch"],
    EmissionCategory.FOOD_DINING,
  ],
  [
    ["utility", "energy", "electric", "water", "pge"],
    EmissionCategory.UTILITIES,
  ],
  [["amazon", "rei", "marketplace", "store"], EmissionCategory.SHOPPING],
  [["shell", "chevron", "fuel", "gas"], EmissionCategory.GAS_FUEL],
  [
    ["home depot", "ikea", "furnishings", "hardware"],
    EmissionCategory.HOME,
  ],
  [
    ["spotify", "netflix", "movie", "theatre", "ticket"],
    EmissionCategory.ENTERTAINMENT,
  ],
  [["cvs", "pharmacy", "kaiser", "clinic"], EmissionCategory.HEALTH],
];

export const SUSTAINABILITY_POINTS: Record<EmissionCategoryValue, number> = {
  [EmissionCategory.GROCERIES]: 85,
  [EmissionCategory.HEALTH]: 80,
  [EmissionCategory.ENTERTAINMENT]: 70,
  [EmissionCategory.HOME]: 65,
  [EmissionCategory.FOOD_DINING]: 55,
  [EmissionCategory.OTHER]: 50,
  [EmissionCategory.SHOPPING]: 45,
  [EmissionCategory.UTILITIES]: 40,
  [EmissionCategory.TRANSPORTATION]: 35,
  [EmissionCategory.GAS_FUEL]: 20,
  [EmissionCategory.TRAVEL]: 15,
};

export const ESSENTIAL_CATEGORIES = new Set<EmissionCategoryValue>([
  EmissionCategory.GROCERIES,
  EmissionCategory.FOOD_DINING,
  EmissionCategory.HOME,
  EmissionCategory.HEALTH,
]);

export const CREDIT_PROFILES: Record<
  CarbonCreditTypeValue,
  CreditProjectProfile
> = {
  [CarbonCreditType.RENEWABLE_ENERGY]: {
    pricePerTonneUsd: 18,
    projectName: "Karnataka Solar Farm Portfolio",
    verificationStandard: "Gold Standard",
  },
  [CarbonCreditType.FORESTRY]: {
    pricePerTonneUsd: 14,
    projectName: "Keo Seima Forest Conservation",
    verificationStandard: "Verra VCS",
  },
  [CarbonCreditType.METHANE_CAPTURE]: {
    pricePerTonneUsd: 16,
    projectName: "Apex Regional Landfill Gas Recovery",
    verificationStandard: "Verra VCS",
  },
  [CarbonCreditType.DIRECT_AIR_CAPTURE]: {
    pricePerTonneUsd: 220,
    projectName: "Mammoth Direct Air Capture Plant",
    verificationStandard: "Puro.earth",
  },
  [CarbonCreditType.SOIL_CARBON]: {
    pricePerTonneUsd: 22,
    projectName: "Northern Plains Regenerative Soil Project",
    verificationStandard: "Climate Action Reserve",
  },
  [CarbonCreditType.OCEAN_BASED]: {
    pricePerTonneUsd: 35,
    projectName: "British Columbia Kelp Restoration Initiative",
    verificationStandard: "Verra VCS",
  },
};

export const DOMINANT_CATEGORY_CREDIT_MAP: Record<
  EmissionCategoryValue,
  CarbonCreditTypeValue
> = {
  [EmissionCategory.TRAVEL]: CarbonCreditType.RENEWABLE_ENERGY,
  [EmissionCategory.GAS_FUEL]: CarbonCreditType.RENEWABLE_ENERGY,
  [EmissionCategory.UTILITIES]: CarbonCreditType.RENEWABLE_ENERGY,
  [EmissionCategory.TRANSPORTATION]: CarbonCreditType.RENEWABLE_ENERGY,
  [EmissionCategory.GROCERIES]: CarbonCreditType.SOIL_CARBON,
  [EmissionCategory.FOOD_DINING]: CarbonCreditType.SOIL_CARBON,
  [EmissionCategory.HOME]: CarbonCreditType.SOIL_CARBON,
  [EmissionCategory.SHOPPING]: CarbonCreditType.METHANE_CAPTURE,
  [EmissionCategory.ENTERTAINMENT]: CarbonCreditType.METHANE_CAPTURE,
  [EmissionCategory.OTHER]: CarbonCreditType.METHANE_CAPTURE,
  [EmissionCategory.HEALTH]: CarbonCreditType.FORESTRY,
};

export const SUGGESTION_RULES: Record<EmissionCategoryValue, SuggestionRule> = {
  [EmissionCategory.TRANSPORTATION]: {
    alternativeShare: 0.55,
    priceDifferenceUsd: -20,
    difficulty: "moderate",
    currentDescription: "Frequent rideshare and car-based commuting",
    alternativeDescription:
      "Shift recurring trips to public transit, biking, or walking",
  },
  [EmissionCategory.FOOD_DINING]: {
    alternativeShare: 0.4,
    priceDifferenceUsd: -35,
    difficulty: "easy",
    currentDescription: "Regular takeout and restaurant-heavy meals",
    alternativeDescription:
      "Batch more home-cooked meals with lower-emission ingredients",
  },
  [EmissionCategory.GROCERIES]: {
    alternativeShare: 0.8,
    priceDifferenceUsd: 10,
    difficulty: "easy",
    currentDescription: "A grocery basket with mixed conventional choices",
    alternativeDescription:
      "Lean into seasonal and plant-forward grocery staples",
  },
  [EmissionCategory.UTILITIES]: {
    alternativeShare: 0.65,
    priceDifferenceUsd: 15,
    difficulty: "moderate",
    currentDescription:
      "A household utility profile with limited efficiency upgrades",
    alternativeDescription:
      "Use a renewable utility plan and tighten energy usage",
  },
  [EmissionCategory.SHOPPING]: {
    alternativeShare: 0.55,
    priceDifferenceUsd: -25,
    difficulty: "easy",
    currentDescription: "New-product shopping across general retail",
    alternativeDescription:
      "Delay low-priority purchases and choose secondhand where possible",
  },
  [EmissionCategory.TRAVEL]: {
    alternativeShare: 0.4,
    priceDifferenceUsd: 40,
    difficulty: "hard",
    currentDescription:
      "Air and hotel spend that signals frequent travel",
    alternativeDescription:
      "Consolidate trips and replace some flights with virtual or rail alternatives",
  },
  [EmissionCategory.GAS_FUEL]: {
    alternativeShare: 0.45,
    priceDifferenceUsd: 25,
    difficulty: "moderate",
    currentDescription: "Recurring gasoline purchases for personal driving",
    alternativeDescription:
      "Combine errands and shift some miles to lower-emission transport",
  },
  [EmissionCategory.HOME]: {
    alternativeShare: 0.7,
    priceDifferenceUsd: 60,
    difficulty: "hard",
    currentDescription:
      "Home improvement and furnishing spend with embedded emissions",
    alternativeDescription:
      "Prioritize durable upgrades and buy fewer, longer-lasting home items",
  },
  [EmissionCategory.ENTERTAINMENT]: {
    alternativeShare: 0.75,
    priceDifferenceUsd: -10,
    difficulty: "easy",
    currentDescription:
      "Entertainment spending centered on venue-based activities",
    alternativeDescription:
      "Swap in lower-impact local or at-home entertainment more often",
  },
  [EmissionCategory.HEALTH]: {
    alternativeShare: 0.85,
    priceDifferenceUsd: -5,
    difficulty: "easy",
    currentDescription:
      "Health-related purchases with some avoidable delivery or convenience overhead",
    alternativeDescription:
      "Bundle routine health purchases and choose local pickup when practical",
  },
  [EmissionCategory.OTHER]: {
    alternativeShare: 0.8,
    priceDifferenceUsd: 0,
    difficulty: "easy",
    currentDescription:
      "Miscellaneous spending without a lower-carbon plan",
    alternativeDescription:
      "Audit recurring miscellaneous purchases and trim the least valuable ones",
  },
};

export const MERCHANT_CATALOG: MerchantTemplate[] = [
  { description: "Uber Trip", mccCode: "4121", baseAmountCents: 1800, spreadCents: 2600 },
  { description: "Lyft Ride", mccCode: "4121", baseAmountCents: 1600, spreadCents: 2400 },
  { description: "City Metro Pass", mccCode: "4111", baseAmountCents: 950, spreadCents: 1200 },
  { description: "Whole Foods Market", mccCode: "5411", baseAmountCents: 4200, spreadCents: 3800 },
  { description: "Trader Joe's", mccCode: "5411", baseAmountCents: 3100, spreadCents: 2600 },
  { description: "Blue Bottle Coffee", mccCode: "5814", baseAmountCents: 900, spreadCents: 1100 },
  { description: "Sweetgreen Lunch", mccCode: "5812", baseAmountCents: 1250, spreadCents: 1450 },
  { description: "PG&E Energy Bill", mccCode: "4900", baseAmountCents: 7800, spreadCents: 6200 },
  { description: "Water Utility Services", mccCode: "4900", baseAmountCents: 5200, spreadCents: 3000 },
  { description: "Amazon Marketplace", mccCode: "5311", baseAmountCents: 2400, spreadCents: 5400 },
  { description: "REI Co-op", mccCode: "5941", baseAmountCents: 3500, spreadCents: 6800 },
  { description: "Delta Air Lines", mccCode: "4511", baseAmountCents: 16500, spreadCents: 22000 },
  { description: "Marriott Hotel", mccCode: "7011", baseAmountCents: 9800, spreadCents: 16000 },
  { description: "Shell Fuel Station", mccCode: "5541", baseAmountCents: 4200, spreadCents: 3200 },
  { description: "Chevron Gas", mccCode: "5541", baseAmountCents: 3800, spreadCents: 2800 },
  { description: "Home Depot", mccCode: "5200", baseAmountCents: 5400, spreadCents: 9200 },
  { description: "IKEA Home Furnishings", mccCode: "5712", baseAmountCents: 6200, spreadCents: 9800 },
  { description: "AMC Theatres", mccCode: "7832", baseAmountCents: 1800, spreadCents: 2200 },
  { description: "Spotify Premium", baseAmountCents: 1100, spreadCents: 400 },
  { description: "CVS Pharmacy", mccCode: "5912", baseAmountCents: 1800, spreadCents: 2600 },
  { description: "Kaiser Permanente", mccCode: "8099", baseAmountCents: 4200, spreadCents: 6800 },
  { description: "Neighborhood Farmers Market", baseAmountCents: 2800, spreadCents: 2400 },
  { description: "Netflix Subscription", baseAmountCents: 1500, spreadCents: 400 },
  { description: "Organic Produce Box", baseAmountCents: 3600, spreadCents: 2200 },
];
