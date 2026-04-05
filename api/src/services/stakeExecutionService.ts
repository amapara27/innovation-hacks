import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  type Connection,
  type Keypair,
} from "@solana/web3.js";
import type { StakeRequest, StakeResponse } from "@carboniq/contracts";
import { prisma } from "../lib/prisma.js";
import { refreshStoredGreenScore } from "./greenScoreService.js";
import {
  computeEffectiveApy,
  simulateStake,
} from "./stakingService.js";
import {
  confirmSolanaSignature,
  getApiPayer,
  getSolanaConnection,
} from "./solanaService.js";

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

export const defaultStakeExecutionDeps: StakeExecutionDeps = {
  getApiPayer,
  getSolanaConnection,
  confirmSolanaSignature,
  refreshStoredGreenScore,
  getVaultAddress: getVaultAddressFromEnv,
  sendStakeTransfer,
};

export async function executeDemoStake(
  request: StakeRequest,
  deps: StakeExecutionDeps = defaultStakeExecutionDeps
): Promise<StakeResponse> {
  const payer = deps.getApiPayer();
  const connection = deps.getSolanaConnection();
  const vaultAddress = deps.getVaultAddress();

  const greenScoreResponse = await deps.refreshStoredGreenScore(request.wallet);
  const simulation = simulateStake(
    request.amount,
    request.durationDays,
    greenScoreResponse.score
  );

  const lamports = Math.round(request.amount * LAMPORTS_PER_SOL);
  if (lamports <= 0) {
    throw new Error("Stake amount is too small after lamport conversion.");
  }

  const solanaSignature = await deps.sendStakeTransfer({
    connection,
    payer,
    vaultAddress,
    lamports,
  });
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
      effectiveApy: computeEffectiveApy(greenScoreResponse.score),
      estimatedYield: simulation.estimatedYield,
      solanaTxHash: solanaSignature,
      vaultAddress: vaultAddress.toBase58(),
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
    vaultAddress: vaultAddress.toBase58(),
    solanaSignature,
    status: "confirmed",
  };
}
