import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MongoClient,
  ObjectId,
  type Collection,
  type Db,
  type Document,
  type Sort,
} from "mongodb";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const projectEnvPath = resolve(moduleDir, "../../.env");
const shouldOverrideDotenv =
  process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";

dotenv.config(
  existsSync(projectEnvPath)
    ? { path: projectEnvPath, override: shouldOverrideDotenv }
    : { override: shouldOverrideDotenv }
);

type UserDoc = {
  _id: ObjectId;
  walletAddress: string;
  greenScore: number;
  greenScoreCurrent?: number;
  greenTierCurrent?: string;
  breakdownTransactionEfficiency?: number;
  breakdownSpendingHabits?: number;
  breakdownCarbonOffsets?: number;
  breakdownCommunityImpact?: number;
  stakingBaseApy?: number;
  stakingGreenBonus?: number;
  stakingEffectiveApy?: number;
  stakingStakedAmount?: number;
  stakingAccruedYield?: number;
  stakeVaultAddress?: string;
  stakingUpdatedAt?: Date;
  latestUploadAt?: Date;
  latestUploadSourceLabel?: string;
  totalCo2eOffset?: number;
  offsetCount?: number;
  createdAt: Date;
  updatedAt: Date;
};

type ImpactRecordDoc = {
  _id: ObjectId;
  userId: ObjectId;
  walletAddress: string;
  co2OffsetGrams: number;
  creditType: string;
  toucanTxHash?: string;
  onChainTxHash?: string;
  proofPda?: string;
  status: string;
  decisionBudgetUsd?: number;
  decisionPricePerTonneUsd?: number;
  decisionProjectName?: string;
  decisionVerificationStandard?: string;
  recordedAt: Date;
};

type StakeRecordDoc = {
  _id: ObjectId;
  userId: ObjectId;
  walletAddress: string;
  amount: number;
  durationDays: number;
  greenScore: number;
  effectiveApy: number;
  estimatedYield: number;
  solanaTxHash?: string | null;
  vaultAddress?: string | null;
  status: string;
  provider: string;
  simulatedAt: Date;
};

type TransactionDoc = {
  _id: ObjectId;
  userId: ObjectId;
  walletAddress: string;
  transactionId: string;
  description: string;
  amountUsd: number;
  mccCode?: string | null;
  date: Date;
  category: string;
  emissionFactor: number;
  co2eGrams: number;
  source: string;
  sourceLabel?: string;
  analyzedAt: Date;
};

type RecommendationRunDoc = {
  _id: ObjectId;
  userId: ObjectId;
  walletAddress: string;
  categoriesRequested: string[];
  totalPotentialSavingsMonthly: number;
  narratorProvider: string;
  model?: string;
  promptHash?: string;
  createdAt: Date;
  suggestions: unknown;
};

type RecommendationActionDoc = {
  _id: ObjectId;
  userId: ObjectId;
  walletAddress: string;
  recommendationRunId: ObjectId;
  suggestionKey: string;
  action: string;
  actedAt: Date;
};

type ProtocolRateSnapshotDoc = {
  _id: ObjectId;
  provider: string;
  metric: string;
  value: number;
  capturedAt: Date;
};

type UserBehaviorStateDoc = {
  _id: ObjectId;
  userId: ObjectId;
  irresponsibleStreak: number;
  lastPenaltyPoints: number;
  lastIrresponsibleShare: number;
  lastSnapshotFingerprint?: string;
  createdAt: Date;
  updatedAt: Date;
};

type YieldRedistributionEventDoc = {
  _id: ObjectId;
  offenderUserId: ObjectId;
  offenderWallet: string;
  triggeredScore: number;
  resetAmount: number;
  redistributedToUsers: number;
  redistributedToNonprofits: number;
  reason: string;
  createdAt: Date;
};

type YieldRedistributionCreditDoc = {
  _id: ObjectId;
  eventId: ObjectId;
  userId: ObjectId;
  amount: number;
  createdAt: Date;
};

type SustainabilityFundLedgerDoc = {
  _id: ObjectId;
  eventId: ObjectId;
  amount: number;
  recipient: string;
  note?: string;
  createdAt: Date;
};

function resolveMongoUrl(): string {
  const candidates = [
    process.env.MONGODB_URI,
    process.env.MONGODB_URL,
    process.env.DATABASE_URL,
    process.env.MDB_MCP_CONNECTION_STRING,
  ];
  const value = candidates.find((candidate) => candidate?.trim());
  if (!value) {
    throw new Error(
      "MongoDB connection string is required. Set MONGODB_URI or DATABASE_URL."
    );
  }
  return value.trim();
}

function resolveDatabaseName(connectionString: string): string {
  const parsed = new URL(connectionString);
  const nameFromPath = parsed.pathname.replace(/^\/+/, "");
  if (nameFromPath) {
    return nameFromPath;
  }
  const nameFromEnv = process.env.MONGODB_DB_NAME?.trim();
  if (nameFromEnv) {
    return nameFromEnv;
  }
  return "carboniq";
}

function buildHelpfulMongoError(error: unknown, connectionString: string): Error {
  const originalMessage =
    error instanceof Error ? error.message : String(error ?? "Unknown Mongo error");
  const host = (() => {
    try {
      return new URL(connectionString).hostname;
    } catch {
      return "unknown-host";
    }
  })();

  if (
    originalMessage.includes("querySrv ENOTFOUND") ||
    originalMessage.includes("querySrv ECONNREFUSED") ||
    originalMessage.includes("ENOTFOUND") ||
    originalMessage.includes("ECONNREFUSED") ||
    originalMessage.includes("No DNS entries exist") ||
    originalMessage.includes("no record found for Query")
  ) {
    return new Error(
      [
        `MongoDB hostname could not be resolved: "${host}".`,
        "If you are using Atlas and your network blocks SRV lookups, set MONGODB_URI to a direct mongodb:// connection string.",
        "If you intended to use Atlas SRV, double-check that the cluster hostname is correct in api/.env.",
      ].join(" ")
    );
  }

  return error instanceof Error ? error : new Error(originalMessage);
}

function toObjectId(value: string | ObjectId): ObjectId {
  return value instanceof ObjectId ? value : new ObjectId(value);
}

function serializeId<T extends { _id: ObjectId }>(doc: T): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = doc;
  return {
    id: _id.toHexString(),
    ...rest,
  };
}

function applySelect(source: Record<string, unknown>, select?: Record<string, boolean>) {
  if (!select) {
    return source;
  }

  const projected: Record<string, unknown> = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled) {
      projected[key] = source[key];
    }
  }
  return projected;
}

function omitKeys<T extends Record<string, unknown>>(
  source: T,
  keys: string[]
): Partial<T> {
  const keySet = new Set(keys);
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !keySet.has(key))
  ) as Partial<T>;
}

function toSort(
  orderBy?:
    | Record<string, "asc" | "desc">
    | Array<Record<string, "asc" | "desc">>
): Sort {
  if (!orderBy) {
    return {};
  }

  const sort: Record<string, 1 | -1> = {};
  const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
  for (const entry of entries) {
    for (const [key, direction] of Object.entries(entry)) {
      const mongoKey = key === "id" ? "_id" : key;
      sort[mongoKey] = direction === "asc" ? 1 : -1;
    }
  }
  return sort as Sort;
}

function buildUserFilter(where?: any): Document {
  const filter: Document = {};
  if (!where) {
    return filter;
  }

  if (where.walletAddress) {
    filter.walletAddress = where.walletAddress;
  }

  if (typeof where.id === "string") {
    filter._id = toObjectId(where.id);
  } else if (where.id?.not) {
    filter._id = { $ne: toObjectId(where.id.not) };
  }

  if (where.greenScore) {
    const scoreFilter: Document = {};
    if (where.greenScore.gt !== undefined) {
      scoreFilter.$gt = where.greenScore.gt;
    }
    if (where.greenScore.gte !== undefined) {
      scoreFilter.$gte = where.greenScore.gte;
    }
    if (Object.keys(scoreFilter).length > 0) {
      filter.greenScore = scoreFilter;
    }
  }

  return filter;
}

function buildImpactFilter(where?: any): Document {
  const filter: Document = {};
  if (!where) {
    return filter;
  }

  if (where.walletAddress) {
    filter.walletAddress = where.walletAddress;
  }
  if (where.status) {
    filter.status = where.status;
  }
  if (where.userId) {
    filter.userId = toObjectId(where.userId);
  }

  return filter;
}

function buildTransactionFilter(where?: any): Document {
  const filter: Document = {};
  if (!where) {
    return filter;
  }

  if (where.walletAddress) {
    filter.walletAddress = where.walletAddress;
  }
  if (where.source) {
    filter.source = where.source;
  }
  if (where.sourceLabel) {
    filter.sourceLabel = where.sourceLabel;
  }
  if (where.transactionId) {
    filter.transactionId = where.transactionId;
  }

  return filter;
}

function buildStakeFilter(where?: any): Document {
  const filter: Document = {};
  if (!where) {
    return filter;
  }

  if (where.userId) {
    filter.userId = toObjectId(where.userId);
  }
  if (where.status) {
    filter.status = where.status;
  }
  if (where.solanaTxHash?.not === null) {
    filter.solanaTxHash = { $ne: null };
  }

  return filter;
}

function buildSnapshotFilter(where?: any): Document {
  const filter: Document = {};
  if (!where) {
    return filter;
  }

  if (where.provider) {
    filter.provider = where.provider;
  }
  if (where.metric) {
    filter.metric = where.metric;
  }
  if (where.capturedAt?.lte) {
    filter.capturedAt = { $lte: where.capturedAt.lte };
  }

  return filter;
}

function buildRecommendationRunFilter(where?: any): Document {
  const filter: Document = {};
  if (!where) {
    return filter;
  }

  if (where.walletAddress) {
    filter.walletAddress = where.walletAddress;
  }
  if (where.userId) {
    filter.userId = toObjectId(where.userId);
  }

  return filter;
}

function buildRecommendationActionFilter(where?: any): Document {
  const filter: Document = {};
  if (!where) {
    return filter;
  }

  if (where.walletAddress) {
    filter.walletAddress = where.walletAddress;
  }
  if (where.userId) {
    filter.userId = toObjectId(where.userId);
  }
  if (where.recommendationRunId) {
    filter.recommendationRunId = toObjectId(where.recommendationRunId);
  }
  if (where.suggestionKey) {
    filter.suggestionKey = where.suggestionKey;
  }
  if (where.action) {
    filter.action = where.action;
  }

  return filter;
}

function buildUserBehaviorStateFilter(where?: any): Document {
  const filter: Document = {};
  if (!where) {
    return filter;
  }

  if (where.userId) {
    filter.userId = toObjectId(where.userId);
  }

  return filter;
}

function buildYieldRedistributionEventFilter(where?: any): Document {
  const filter: Document = {};
  if (!where) {
    return filter;
  }

  if (where.offenderUserId) {
    filter.offenderUserId = toObjectId(where.offenderUserId);
  }

  return filter;
}

function buildYieldRedistributionCreditFilter(where?: any): Document {
  const filter: Document = {};
  if (!where) {
    return filter;
  }

  if (where.userId) {
    filter.userId = toObjectId(where.userId);
  }

  return filter;
}

function normalizeUserCreate(input: any, walletAddress: string, now: Date): Omit<UserDoc, "_id"> {
  return {
    walletAddress,
    greenScore: input.greenScore ?? 0,
    greenScoreCurrent: input.greenScoreCurrent ?? input.greenScore ?? 0,
    greenTierCurrent: input.greenTierCurrent ?? "seedling",
    breakdownTransactionEfficiency: input.breakdownTransactionEfficiency ?? 0,
    breakdownSpendingHabits: input.breakdownSpendingHabits ?? 0,
    breakdownCarbonOffsets: input.breakdownCarbonOffsets ?? 0,
    breakdownCommunityImpact: input.breakdownCommunityImpact ?? 0,
    stakingBaseApy: input.stakingBaseApy ?? 0,
    stakingGreenBonus: input.stakingGreenBonus ?? 0,
    stakingEffectiveApy: input.stakingEffectiveApy ?? 0,
    stakingStakedAmount: input.stakingStakedAmount ?? 0,
    stakingAccruedYield: input.stakingAccruedYield ?? 0,
    stakeVaultAddress: input.stakeVaultAddress,
    stakingUpdatedAt: input.stakingUpdatedAt,
    latestUploadAt: input.latestUploadAt,
    latestUploadSourceLabel: input.latestUploadSourceLabel,
    totalCo2eOffset: input.totalCo2eOffset ?? 0,
    offsetCount: input.offsetCount ?? 0,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
}

function normalizeUserUpdate(input: any, now: Date): Document {
  return {
    ...input,
    updatedAt: now,
  };
}

function normalizeUser(userDoc: UserDoc) {
  return serializeId(userDoc);
}

const mongoUrl = resolveMongoUrl();
const mongoDatabaseName = resolveDatabaseName(mongoUrl);

let clientPromise: Promise<MongoClient> | null = null;

async function getDb(): Promise<Db> {
  if (!clientPromise) {
    const client = new MongoClient(mongoUrl, {
      serverSelectionTimeoutMS: 5000,
    });
    clientPromise = client.connect().catch((error) => {
      clientPromise = null;
      throw buildHelpfulMongoError(error, mongoUrl);
    });
  }

  const client = await clientPromise;
  return client.db(mongoDatabaseName);
}

async function getCollection<T extends Document>(name: string): Promise<Collection<T>> {
  return (await getDb()).collection<T>(name);
}

async function sumField<T extends Document>(
  name: string,
  match: Document,
  field: string
): Promise<number> {
  const collection = await getCollection<T>(name);
  const rows = await collection
    .aggregate<{ total?: number }>([
      { $match: match },
      { $group: { _id: null, total: { $sum: `$${field}` } } },
    ])
    .toArray();

  return Number(rows[0]?.total ?? 0);
}

async function getProjectedImpacts(userId: ObjectId, select?: Record<string, boolean>) {
  const impacts = await (await getCollection<ImpactRecordDoc>("ImpactRecord"))
    .find({ userId })
    .toArray();

  return impacts.map((impact) => applySelect(serializeId(impact), select));
}

async function getProjectedStakes(userId: ObjectId, select?: Record<string, boolean>) {
  const stakes = await (await getCollection<StakeRecordDoc>("StakeRecord"))
    .find({ userId })
    .toArray();

  return stakes.map((stake) => applySelect(serializeId(stake), select));
}

async function getProjectedTransactions(
  userId: ObjectId,
  select?: Record<string, boolean>
) {
  const transactions = await (await getCollection<TransactionDoc>("Transaction"))
    .find({ userId })
    .toArray();

  return transactions.map((transaction) =>
    applySelect(serializeId(transaction), select)
  );
}

async function projectUser(userDoc: UserDoc, args?: any) {
  const normalized = normalizeUser(userDoc) as Record<string, unknown>;

  if (args?.include?.impacts) {
    normalized.impacts = await getProjectedImpacts(
      userDoc._id,
      args.include.impacts.select
    );
  }

  if (args?.include?.stakes) {
    normalized.stakes = await getProjectedStakes(
      userDoc._id,
      args.include.stakes.select
    );
  }

  if (args?.include?.transactions) {
    normalized.transactions = await getProjectedTransactions(
      userDoc._id,
      args.include.transactions.select
    );
  }

  return applySelect(normalized, args?.select);
}

export const prisma: any = {
  user: {
    async create(args: any) {
      const collection = await getCollection<UserDoc>("User");
      const now = new Date();
      const document: UserDoc = {
        _id: new ObjectId(),
        ...normalizeUserCreate(
          args.data ?? {},
          args.data.walletAddress,
          now
        ),
      };

      await collection.insertOne(document);
      return normalizeUser(document);
    },

    async upsert(args: any) {
      const collection = await getCollection<UserDoc>("User");
      const now = new Date();
      const walletAddress = args.where.walletAddress;
      const updatePayload = normalizeUserUpdate(args.update ?? {}, now);
      const userOnInsert = normalizeUserCreate(args.create ?? {}, walletAddress, now);
      const { updatedAt: _ignoredUpdatedAt, ...insertWithoutUpdatedAt } = userOnInsert;
      await collection.updateOne(
        { walletAddress },
        {
          $set: updatePayload,
          $setOnInsert: omitKeys(insertWithoutUpdatedAt, Object.keys(updatePayload)),
        },
        { upsert: true }
      );

      const userDoc = await collection.findOne({ walletAddress });
      if (!userDoc) {
        throw new Error(`Failed to upsert user for wallet ${walletAddress}`);
      }
      return normalizeUser(userDoc);
    },

    async update(args: any) {
      const collection = await getCollection<UserDoc>("User");
      const filter = buildUserFilter(args.where);
      await collection.updateOne(filter, {
        $set: normalizeUserUpdate(args.data ?? {}, new Date()),
      });

      const userDoc = await collection.findOne(filter);
      if (!userDoc) {
        throw new Error("Failed to update user");
      }
      return normalizeUser(userDoc);
    },

    async count(args: any = {}) {
      const collection = await getCollection<UserDoc>("User");
      return collection.countDocuments(buildUserFilter(args.where));
    },

    async findMany(args: any = {}) {
      const collection = await getCollection<UserDoc>("User");
      const userDocs = await collection
        .find(buildUserFilter(args.where))
        .sort(toSort(args.orderBy))
        .skip(args.skip ?? 0)
        .limit(args.take ?? 0)
        .toArray();

      return Promise.all(userDocs.map((userDoc) => projectUser(userDoc, args)));
    },

    async findUnique(args: any) {
      const collection = await getCollection<UserDoc>("User");
      const userDoc = await collection.findOne(buildUserFilter(args.where));
      if (!userDoc) {
        return null;
      }
      return projectUser(userDoc, args);
    },

    async findUniqueOrThrow(args: any) {
      const user = await this.findUnique(args);
      if (!user) {
        throw new Error("User not found");
      }
      return user;
    },
  },

  transaction: {
    async upsert(args: any) {
      const collection = await getCollection<TransactionDoc>("Transaction");
      const filter = {
        walletAddress: args.where.walletAddress_transactionId.walletAddress,
        transactionId: args.where.walletAddress_transactionId.transactionId,
      };
      const updatePayload = {
        ...args.update,
      };
      const insertPayload = {
        ...args.create,
        userId: toObjectId(args.create.userId),
      };

      await collection.updateOne(
        filter,
        {
          $set: updatePayload,
          $setOnInsert: omitKeys(insertPayload, Object.keys(updatePayload)),
        },
        { upsert: true }
      );

      const transactionDoc = await collection.findOne(filter);
      if (!transactionDoc) {
        throw new Error("Failed to upsert transaction");
      }
      return serializeId(transactionDoc);
    },

    async findMany(args: any = {}) {
      const collection = await getCollection<TransactionDoc>("Transaction");
      const docs = await collection
        .find(buildTransactionFilter(args.where))
        .sort(toSort(args.orderBy))
        .skip(args.skip ?? 0)
        .limit(args.take ?? 0)
        .toArray();

      return docs.map((doc) => applySelect(serializeId(doc), args.select));
    },
  },

  recommendationRun: {
    async create(args: any) {
      const collection = await getCollection<RecommendationRunDoc>("RecommendationRun");
      const document: RecommendationRunDoc = {
        _id: new ObjectId(),
        userId: toObjectId(args.data.userId),
        walletAddress: args.data.walletAddress,
        categoriesRequested: args.data.categoriesRequested ?? [],
        totalPotentialSavingsMonthly: args.data.totalPotentialSavingsMonthly,
        narratorProvider: args.data.narratorProvider,
        model: args.data.model,
        promptHash: args.data.promptHash,
        createdAt: args.data.createdAt ?? new Date(),
        suggestions: args.data.suggestions,
      };

      await collection.insertOne(document);
      return serializeId(document);
    },

    async findFirst(args: any = {}) {
      const collection = await getCollection<RecommendationRunDoc>("RecommendationRun");
      const doc = await collection
        .find(buildRecommendationRunFilter(args.where))
        .sort(toSort(args.orderBy))
        .limit(1)
        .next();

      if (!doc) {
        return null;
      }

      return applySelect(serializeId(doc), args.select);
    },
  },

  recommendationAction: {
    async create(args: any) {
      const collection = await getCollection<RecommendationActionDoc>(
        "RecommendationAction"
      );
      const document: RecommendationActionDoc = {
        _id: new ObjectId(),
        userId: toObjectId(args.data.userId),
        walletAddress: args.data.walletAddress,
        recommendationRunId: toObjectId(args.data.recommendationRunId),
        suggestionKey: args.data.suggestionKey,
        action: args.data.action,
        actedAt: args.data.actedAt ?? new Date(),
      };

      await collection.insertOne(document);
      return serializeId(document);
    },

    async findMany(args: any = {}) {
      const collection = await getCollection<RecommendationActionDoc>(
        "RecommendationAction"
      );
      const docs = await collection
        .find(buildRecommendationActionFilter(args.where))
        .sort(toSort(args.orderBy))
        .skip(args.skip ?? 0)
        .limit(args.take ?? 0)
        .toArray();

      return docs.map((doc) => applySelect(serializeId(doc), args.select));
    },
  },

  impactRecord: {
    async create(args: any) {
      const collection = await getCollection<ImpactRecordDoc>("ImpactRecord");
      const document: ImpactRecordDoc = {
        _id: new ObjectId(),
        userId: toObjectId(args.data.userId),
        walletAddress: args.data.walletAddress,
        co2OffsetGrams: args.data.co2OffsetGrams,
        creditType: args.data.creditType,
        toucanTxHash: args.data.toucanTxHash,
        onChainTxHash: args.data.onChainTxHash,
        proofPda: args.data.proofPda,
        status: args.data.status,
        decisionBudgetUsd: args.data.decisionBudgetUsd,
        decisionPricePerTonneUsd: args.data.decisionPricePerTonneUsd,
        decisionProjectName: args.data.decisionProjectName,
        decisionVerificationStandard: args.data.decisionVerificationStandard,
        recordedAt: args.data.recordedAt ?? new Date(),
      };

      await collection.insertOne(document);
      return serializeId(document);
    },

    async createMany(args: any) {
      const collection = await getCollection<ImpactRecordDoc>("ImpactRecord");
      const documents: ImpactRecordDoc[] = args.data.map((row: any) => ({
        _id: new ObjectId(),
        userId: toObjectId(row.userId),
        walletAddress: row.walletAddress,
        co2OffsetGrams: row.co2OffsetGrams,
        creditType: row.creditType,
        toucanTxHash: row.toucanTxHash,
        onChainTxHash: row.onChainTxHash,
        proofPda: row.proofPda,
        status: row.status,
        decisionBudgetUsd: row.decisionBudgetUsd,
        decisionPricePerTonneUsd: row.decisionPricePerTonneUsd,
        decisionProjectName: row.decisionProjectName,
        decisionVerificationStandard: row.decisionVerificationStandard,
        recordedAt: row.recordedAt ?? new Date(),
      }));

      if (documents.length === 0) {
        return { count: 0 };
      }

      const result = await collection.insertMany(documents);
      return { count: result.insertedCount };
    },

    async findMany(args: any = {}) {
      const collection = await getCollection<ImpactRecordDoc>("ImpactRecord");
      const docs = await collection.find(buildImpactFilter(args.where)).toArray();
      return docs.map((doc) => applySelect(serializeId(doc), args.select));
    },

    async aggregate(args: any = {}) {
      const total = await sumField<ImpactRecordDoc>(
        "ImpactRecord",
        buildImpactFilter(args.where),
        "co2OffsetGrams"
      );
      return {
        _sum: {
          co2OffsetGrams: total,
        },
      };
    },
  },

  stakeRecord: {
    async create(args: any) {
      const collection = await getCollection<StakeRecordDoc>("StakeRecord");
      const document: StakeRecordDoc = {
        _id: new ObjectId(),
        userId: toObjectId(args.data.userId),
        walletAddress: args.data.walletAddress,
        amount: args.data.amount,
        durationDays: args.data.durationDays,
        greenScore: args.data.greenScore,
        effectiveApy: args.data.effectiveApy,
        estimatedYield: args.data.estimatedYield,
        solanaTxHash: args.data.solanaTxHash ?? null,
        vaultAddress: args.data.vaultAddress ?? null,
        status: args.data.status,
        provider: args.data.provider,
        simulatedAt: args.data.simulatedAt ?? new Date(),
      };

      await collection.insertOne(document);
      return serializeId(document);
    },

    async createMany(args: any) {
      const collection = await getCollection<StakeRecordDoc>("StakeRecord");
      const documents: StakeRecordDoc[] = args.data.map((row: any) => ({
        _id: new ObjectId(),
        userId: toObjectId(row.userId),
        walletAddress: row.walletAddress,
        amount: row.amount,
        durationDays: row.durationDays,
        greenScore: row.greenScore,
        effectiveApy: row.effectiveApy,
        estimatedYield: row.estimatedYield,
        solanaTxHash: row.solanaTxHash ?? null,
        vaultAddress: row.vaultAddress ?? null,
        status: row.status,
        provider: row.provider ?? "demo",
        simulatedAt: row.simulatedAt ?? new Date(),
      }));

      if (documents.length === 0) {
        return { count: 0 };
      }

      const result = await collection.insertMany(documents);
      return { count: result.insertedCount };
    },

    async aggregate(args: any = {}) {
      const amount = args._sum?.amount
        ? await sumField<StakeRecordDoc>(
            "StakeRecord",
            buildStakeFilter(args.where),
            "amount"
          )
        : undefined;
      const estimatedYield = args._sum?.estimatedYield
        ? await sumField<StakeRecordDoc>(
            "StakeRecord",
            buildStakeFilter(args.where),
            "estimatedYield"
          )
        : undefined;

      return {
        _sum: {
          amount,
          estimatedYield,
        },
      };
    },
  },

  protocolRateSnapshot: {
    async create(args: any) {
      const collection = await getCollection<ProtocolRateSnapshotDoc>(
        "ProtocolRateSnapshot"
      );
      const document: ProtocolRateSnapshotDoc = {
        _id: new ObjectId(),
        provider: args.data.provider,
        metric: args.data.metric,
        value: args.data.value,
        capturedAt: args.data.capturedAt ?? new Date(),
      };

      await collection.insertOne(document);
      return serializeId(document);
    },

    async findFirst(args: any = {}) {
      const collection = await getCollection<ProtocolRateSnapshotDoc>(
        "ProtocolRateSnapshot"
      );
      const doc = await collection
        .find(buildSnapshotFilter(args.where))
        .sort(toSort(args.orderBy))
        .limit(1)
        .next();

      if (!doc) {
        return null;
      }

      return applySelect(serializeId(doc), args.select);
    },
  },

  userBehaviorState: {
    async findUnique(args: any) {
      const collection = await getCollection<UserBehaviorStateDoc>("UserBehaviorState");
      const doc = await collection.findOne(buildUserBehaviorStateFilter(args.where));
      if (!doc) {
        return null;
      }
      return applySelect(serializeId(doc), args.select);
    },

    async upsert(args: any) {
      const collection = await getCollection<UserBehaviorStateDoc>("UserBehaviorState");
      const now = new Date();
      const filter = buildUserBehaviorStateFilter(args.where);
      const updatePayload = {
        ...args.update,
        updatedAt: now,
      };
      const insertPayload = {
        userId: toObjectId(args.create.userId),
        irresponsibleStreak: args.create.irresponsibleStreak ?? 0,
        lastPenaltyPoints: args.create.lastPenaltyPoints ?? 0,
        lastIrresponsibleShare: args.create.lastIrresponsibleShare ?? 0,
        lastSnapshotFingerprint: args.create.lastSnapshotFingerprint,
        createdAt: now,
      };

      await collection.updateOne(
        filter,
        {
          $set: updatePayload,
          $setOnInsert: omitKeys(insertPayload, Object.keys(updatePayload)),
        },
        { upsert: true }
      );

      const doc = await collection.findOne(filter);
      if (!doc) {
        throw new Error("Failed to upsert user behavior state");
      }
      return serializeId(doc);
    },
  },

  yieldRedistributionEvent: {
    async aggregate(args: any = {}) {
      const total = await sumField<YieldRedistributionEventDoc>(
        "YieldRedistributionEvent",
        buildYieldRedistributionEventFilter(args.where),
        "resetAmount"
      );
      return {
        _sum: {
          resetAmount: total,
        },
      };
    },

    async create(args: any) {
      const collection = await getCollection<YieldRedistributionEventDoc>(
        "YieldRedistributionEvent"
      );
      const document: YieldRedistributionEventDoc = {
        _id: new ObjectId(),
        offenderUserId: toObjectId(args.data.offenderUserId),
        offenderWallet: args.data.offenderWallet,
        triggeredScore: args.data.triggeredScore,
        resetAmount: args.data.resetAmount,
        redistributedToUsers: args.data.redistributedToUsers,
        redistributedToNonprofits: args.data.redistributedToNonprofits,
        reason: args.data.reason,
        createdAt: args.data.createdAt ?? new Date(),
      };

      await collection.insertOne(document);
      const normalized = serializeId(document);
      return applySelect(normalized, args.select);
    },
  },

  yieldRedistributionCredit: {
    async aggregate(args: any = {}) {
      const total = await sumField<YieldRedistributionCreditDoc>(
        "YieldRedistributionCredit",
        buildYieldRedistributionCreditFilter(args.where),
        "amount"
      );
      return {
        _sum: {
          amount: total,
        },
      };
    },

    async createMany(args: any) {
      const collection = await getCollection<YieldRedistributionCreditDoc>(
        "YieldRedistributionCredit"
      );
      const documents: YieldRedistributionCreditDoc[] = args.data.map((row: any) => ({
        _id: new ObjectId(),
        eventId: toObjectId(row.eventId),
        userId: toObjectId(row.userId),
        amount: row.amount,
        createdAt: row.createdAt ?? new Date(),
      }));

      if (documents.length === 0) {
        return { count: 0 };
      }

      const result = await collection.insertMany(documents);
      return { count: result.insertedCount };
    },
  },

  sustainabilityFundLedger: {
    async create(args: any) {
      const collection = await getCollection<SustainabilityFundLedgerDoc>(
        "SustainabilityFundLedger"
      );
      const document: SustainabilityFundLedgerDoc = {
        _id: new ObjectId(),
        eventId: toObjectId(args.data.eventId),
        amount: args.data.amount,
        recipient: args.data.recipient ?? "verified_nonprofit_pool",
        note: args.data.note,
        createdAt: args.data.createdAt ?? new Date(),
      };

      await collection.insertOne(document);
      return serializeId(document);
    },
  },

  async $runCommandRaw(command: Document) {
    return (await getDb()).command(command);
  },

  async $disconnect() {
    if (!clientPromise) {
      return;
    }

    const client = await clientPromise;
    await client.close();
    clientPromise = null;
  },
};
