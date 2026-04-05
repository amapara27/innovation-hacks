import {
  LAMPORTS_PER_SOL,
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
  simulateStake,
} from "./stakingService.js";
import { getProtocolBaseApy } from "./stakingRateService.js";
import {
  confirmSolanaSignature,
  getApiPayer,
  getSolanaConnection,
} from "./solanaService.js";

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
  executeProtocolStake,
};

export async function executeDemoStake(
  request: StakeRequest,
  deps: StakeExecutionDeps = defaultStakeExecutionDeps
): Promise<StakeResponse> {
  const payer = deps.getApiPayer();
  const connection = deps.getSolanaConnection();

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
    ? await deps.executeProtocolStake({
        connection,
        payer,
        lamports,
      })
    : null;

  let destinationAddress: string;
  let solanaSignature: string;

  if (protocolExecution) {
    destinationAddress = protocolExecution.destinationAddress;
    solanaSignature = protocolExecution.solanaSignature;
  } else {
    const vaultAddress = deps.getVaultAddress();
    solanaSignature = await deps.sendStakeTransfer({
      connection,
      payer,
      vaultAddress,
      lamports,
    });
    destinationAddress = vaultAddress.toBase58();
  }

  await deps.confirmSolanaSignature(solanaSignature);

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
      amount: request.amount,
      durationDays: request.durationDays,
      greenScore: greenScoreResponse.score,
      effectiveApy: computeEffectiveApyWithBase(greenScoreResponse.score, baseApy),
      estimatedYield: simulation.estimatedYield,
      solanaTxHash: solanaSignature,
      vaultAddress: destinationAddress,
      status: "confirmed",
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
