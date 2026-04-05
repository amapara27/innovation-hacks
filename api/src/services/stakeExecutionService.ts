import {
  LAMPORTS_PER_SOL,
  ParsedInstruction,
  PartiallyDecodedInstruction,
  PublicKey,
  SystemProgram,
  Transaction,
  type Connection,
  type Keypair,
} from "@solana/web3.js";
import type { StakeRequest, StakeResponse } from "@carboniq/contracts";
import {
  BN as MarinadeBN,
  Marinade,
  MarinadeConfig,
} from "@marinade.finance/marinade-ts-sdk";
import { prisma } from "../lib/prisma.js";
import { refreshStoredGreenScore } from "./greenScoreService.js";
import {
  computeEffectiveApyWithBase,
  computeGreenBonus,
  simulateStake,
} from "./stakingService.js";
import { getProtocolBaseApy } from "./stakingRateService.js";
import {
  confirmSolanaSignature,
  getApiPayer,
  getSolanaConnection,
} from "./solanaService.js";
import { getNetAccruedYieldForUser } from "./behaviorIncentiveService.js";

type StakingProvider = "marinade" | "jito" | "demo";

type ProtocolStakeExecution = {
  provider: Exclude<StakingProvider, "demo">;
  solanaSignature: string;
  destinationAddress: string;
};

export type StakeExecutionDeps = {
  getApiPayer: typeof getApiPayer;
  getSolanaConnection: typeof getSolanaConnection;
  confirmSolanaSignature: typeof confirmSolanaSignature;
  refreshStoredGreenScore: typeof refreshStoredGreenScore;
  getVaultAddress: () => PublicKey;
  sendStakeTransfer: (input: {
    connection: Connection;
    payer: Keypair;
    vaultAddress: PublicKey;
    lamports: number;
  }) => Promise<string>;
  verifyWalletStakeSignature?: (input: {
    connection: Connection;
    signature: string;
    wallet: string;
    vaultAddress: PublicKey;
    lamports: number;
  }) => Promise<string>;
  executeProtocolStake?: (input: {
    connection: Connection;
    payer: Keypair;
    lamports: number;
  }) => Promise<ProtocolStakeExecution | null>;
};

function getVaultAddressFromEnv(): PublicKey {
  const address = process.env.SOLANA_STAKING_VAULT_ADDRESS;
  if (!address) {
    throw new Error("SOLANA_STAKING_VAULT_ADDRESS env var is required.");
  }

  try {
    return new PublicKey(address);
  } catch {
    throw new Error(
      "SOLANA_STAKING_VAULT_ADDRESS must be a valid Solana public key."
    );
  }
}

export function getStakeVaultAddress(): PublicKey {
  return getVaultAddressFromEnv();
}

async function sendStakeTransfer({
  connection,
  payer,
  vaultAddress,
  lamports,
}: {
  connection: Connection;
  payer: Keypair;
  vaultAddress: PublicKey;
  lamports: number;
}): Promise<string> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: vaultAddress,
      lamports,
    })
  );

  transaction.sign(payer);

  return connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
}

function isParsedInstruction(
  instruction: ParsedInstruction | PartiallyDecodedInstruction
): instruction is ParsedInstruction {
  return "parsed" in instruction;
}

async function verifyWalletStakeSignature({
  connection,
  signature,
  wallet,
  vaultAddress,
  lamports,
}: {
  connection: Connection;
  signature: string;
  wallet: string;
  vaultAddress: PublicKey;
  lamports: number;
}): Promise<string> {
  const transaction = await connection.getParsedTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!transaction) {
    throw new Error("Unable to load signed staking transaction from Solana RPC.");
  }
  if (transaction.meta?.err) {
    throw new Error("Signed staking transaction failed on-chain.");
  }

  const expectedSource = wallet;
  const expectedDestination = vaultAddress.toBase58();
  let matchedTransfer = false;

  for (const instruction of transaction.transaction.message.instructions) {
    if (!isParsedInstruction(instruction)) {
      continue;
    }
    if (instruction.program !== "system") {
      continue;
    }

    const parsed = instruction.parsed as
      | { type?: string; info?: Record<string, unknown> }
      | undefined;
    if (parsed?.type !== "transfer" || !parsed.info) {
      continue;
    }

    const source = String(parsed.info.source ?? "");
    const destination = String(parsed.info.destination ?? "");
    const transferLamports = Number(parsed.info.lamports ?? 0);

    if (
      source === expectedSource &&
      destination === expectedDestination &&
      transferLamports === lamports
    ) {
      matchedTransfer = true;
      break;
    }
  }

  if (!matchedTransfer) {
    throw new Error(
      "Signed transaction does not match expected wallet-to-vault stake transfer."
    );
  }

  return expectedDestination;
}

function getStakingProvider(): StakingProvider {
  const provider = process.env.SOLANA_STAKING_PROVIDER
    ?.trim()
    .toLowerCase();

  if (provider === "marinade") {
    return "marinade";
  }
  if (provider === "jito") {
    return "jito";
  }
  if (provider === "demo" || provider === "transfer" || provider === "vault") {
    return "demo";
  }

  // Default to protocol-first behavior for real staking on devnet.
  return "marinade";
}

function isFallbackToDemoEnabled(): boolean {
  const value = process.env.SOLANA_STAKING_FALLBACK_TO_DEMO
    ?.trim()
    .toLowerCase();

  if (!value) {
    // Keep protocol behavior strict by default so Marinade failures surface
    // instead of silently switching to demo transfers.
    return false;
  }

  return value !== "0" && value !== "false" && value !== "no";
}

async function executeMarinadeStake({
  connection,
  payer,
  lamports,
}: {
  connection: Connection;
  payer: Keypair;
  lamports: number;
}): Promise<ProtocolStakeExecution> {
  const marinade = new Marinade(
    new MarinadeConfig({
      connection,
      publicKey: payer.publicKey,
    })
  );

  const { transaction, associatedMSolTokenAccountAddress } =
    await marinade.deposit(new MarinadeBN(lamports));

  transaction.feePayer = payer.publicKey;

  const solanaSignature = await connection.sendTransaction(transaction, [payer], {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 3,
  });

  return {
    provider: "marinade",
    solanaSignature,
    destinationAddress: associatedMSolTokenAccountAddress.toBase58(),
  };
}

async function executeProtocolStake({
  connection,
  payer,
  lamports,
}: {
  connection: Connection;
  payer: Keypair;
  lamports: number;
}): Promise<ProtocolStakeExecution | null> {
  const provider = getStakingProvider();
  if (provider === "demo") {
    return null;
  }

  if (provider === "jito") {
    const error = new Error(
      "Jito stake path is not configured in this backend yet. Use SOLANA_STAKING_PROVIDER=marinade or demo."
    );
    if (isFallbackToDemoEnabled()) {
      console.warn(`[stake] ${error.message} Falling back to demo transfer.`);
      return null;
    }
    throw error;
  }

  try {
    return await executeMarinadeStake({ connection, payer, lamports });
  } catch (err) {
    if (isFallbackToDemoEnabled()) {
      const details = err instanceof Error ? err.message : String(err);
      console.warn(
        `[stake] Marinade execution failed (${details}). Falling back to demo transfer.`
      );
      return null;
    }
    throw err;
  }
}

export const defaultStakeExecutionDeps: StakeExecutionDeps = {
  getApiPayer,
  getSolanaConnection,
  confirmSolanaSignature,
  refreshStoredGreenScore,
  getVaultAddress: getVaultAddressFromEnv,
  sendStakeTransfer,
  verifyWalletStakeSignature,
  executeProtocolStake,
};

export async function executeDemoStake(
  request: StakeRequest,
  deps: StakeExecutionDeps = defaultStakeExecutionDeps
): Promise<StakeResponse> {
  const connection = deps.getSolanaConnection();
  const payer = request.solanaSignature ? null : deps.getApiPayer();

  const greenScoreResponse = await deps.refreshStoredGreenScore(request.wallet);
  const baseApy = await getProtocolBaseApy();
  const simulation = simulateStake(
    request.amount,
    request.durationDays,
    greenScoreResponse.score,
    baseApy
  );

  const lamports = Math.round(request.amount * LAMPORTS_PER_SOL);
  if (lamports <= 0) {
    throw new Error("Stake amount is too small after lamport conversion.");
  }

  const protocolExecution = deps.executeProtocolStake
    ? request.solanaSignature
      ? null
      : await deps.executeProtocolStake(
          (() => {
            if (!payer) {
              throw new Error("API payer is required for server-side staking.");
            }
            return { connection, payer, lamports };
          })()
        )
    : null;

  let destinationAddress: string;
  let solanaSignature: string;

  if (request.solanaSignature) {
    await deps.confirmSolanaSignature(request.solanaSignature);
    const vaultAddress = deps.getVaultAddress();
    destinationAddress = deps.verifyWalletStakeSignature
      ? await deps.verifyWalletStakeSignature({
          connection,
          signature: request.solanaSignature,
          wallet: request.wallet,
          vaultAddress,
          lamports,
        })
      : vaultAddress.toBase58();
    solanaSignature = request.solanaSignature;
  } else if (protocolExecution) {
    destinationAddress = protocolExecution.destinationAddress;
    solanaSignature = protocolExecution.solanaSignature;
  } else {
    if (!payer) {
      throw new Error("API payer is required for demo transfer staking.");
    }
    const vaultAddress = deps.getVaultAddress();
    solanaSignature = await deps.sendStakeTransfer({
      connection,
      payer,
      vaultAddress,
      lamports,
    });
    destinationAddress = vaultAddress.toBase58();
  }

  if (!request.solanaSignature) {
    await deps.confirmSolanaSignature(solanaSignature);
  }

  const user = await prisma.user.upsert({
    where: { walletAddress: request.wallet },
    update: {},
    create: {
      walletAddress: request.wallet,
      greenScore: greenScoreResponse.score,
    },
  });

  await prisma.stakeRecord.create({
    data: {
      userId: user.id,
      walletAddress: request.wallet,
      amount: request.amount,
      durationDays: request.durationDays,
      greenScore: greenScoreResponse.score,
      effectiveApy: computeEffectiveApyWithBase(greenScoreResponse.score, baseApy),
      estimatedYield: simulation.estimatedYield,
      solanaTxHash: solanaSignature,
      vaultAddress: destinationAddress,
      status: "confirmed",
      provider: protocolExecution?.provider ?? (request.solanaSignature ? "wallet_signed" : "demo"),
    },
  });

  const stakeAgg = await prisma.stakeRecord.aggregate({
    where: {
      userId: user.id,
      status: "confirmed",
    },
    _sum: { amount: true },
  });
  const netStakedAmount = Math.max(0, stakeAgg._sum.amount ?? 0);
  const netAccruedYield = await getNetAccruedYieldForUser(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      stakingBaseApy: parseFloat(baseApy.toFixed(4)),
      stakingGreenBonus: parseFloat(
        computeGreenBonus(greenScoreResponse.score).toFixed(4)
      ),
      stakingEffectiveApy: parseFloat(simulation.effectiveApy.toFixed(4)),
      stakingStakedAmount: parseFloat(netStakedAmount.toFixed(6)),
      stakingAccruedYield: parseFloat(netAccruedYield.toFixed(6)),
      stakeVaultAddress: destinationAddress,
      stakingUpdatedAt: new Date(),
    },
  });

  return {
    wallet: request.wallet,
    amount: request.amount,
    durationDays: request.durationDays,
    greenScore: greenScoreResponse.score,
    effectiveApy: simulation.effectiveApy,
    estimatedYield: simulation.estimatedYield,
    vaultAddress: destinationAddress,
    solanaSignature,
    status: "confirmed",
  };
}
