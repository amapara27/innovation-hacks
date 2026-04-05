import { roundTo } from "../lib/aiMath.js";
import { clampGreenScore } from "../lib/blockchain.js";
import { prisma } from "../lib/prisma.js";
import {
  LAMPORTS_PER_SOL,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type Connection,
} from "@solana/web3.js";
import bs58 from "bs58";
import {
  BN as MarinadeBN,
  Marinade,
  MarinadeConfig,
} from "@marinade.finance/marinade-ts-sdk";
import type {
  StakeCollectRequest,
  StakeCollectResponse,
  StakeSettlementSource,
  StakeWithdrawRequest,
  StakeWithdrawResponse,
} from "@carboniq/contracts";
import { getNetAccruedYieldForUser } from "./behaviorIncentiveService.js";
import { computeGreenBonus, computeEffectiveApyWithBase } from "./stakingService.js";
import { getProtocolBaseApy } from "./stakingRateService.js";
import {
  confirmSolanaSignature,
  getApiPayer,
  getSolanaConnection,
} from "./solanaService.js";
import { getStakeVaultAddress } from "./stakeExecutionService.js";

type PayoutSettlement = {
  settlementSource: StakeSettlementSource;
  solanaSignature?: string;
  explorerUrl?: string;
  sourceAddress?: string;
};

export type StakePayoutDeps = {
  settlePayout: (input: {
    wallet: string;
    amountSol: number;
    reason?: "collect" | "withdraw";
  }) => Promise<PayoutSettlement>;
  getProtocolBaseApy: typeof getProtocolBaseApy;
};

function toExplorerUrl(signature?: string): string | undefined {
  return signature
    ? `https://explorer.solana.com/tx/${signature}?cluster=devnet`
    : undefined;
}

function decodeSecretKey(secret: string, label: string): Keypair {
  try {
    return Keypair.fromSecretKey(bs58.decode(secret));
  } catch {
    try {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret) as number[]));
    } catch {
      throw new Error(
        `${label} must be base58 or a JSON byte array private key.`
      );
    }
  }
}

function getStakeVaultSigner(): Keypair | null {
  const rawSecret = process.env.SOLANA_STAKING_VAULT_SECRET_KEY?.trim();
  if (!rawSecret) {
    return null;
  }

  const signer = decodeSecretKey(rawSecret, "SOLANA_STAKING_VAULT_SECRET_KEY");
  const configuredVault = getStakeVaultAddress().toBase58();
  const signerAddress = signer.publicKey.toBase58();

  if (configuredVault !== signerAddress) {
    throw new Error(
      `SOLANA_STAKING_VAULT_SECRET_KEY does not match SOLANA_STAKING_VAULT_ADDRESS (${configuredVault}).`
    );
  }

  return signer;
}

async function sendPayoutTransfer(input: {
  connection: Connection;
  signer: Keypair;
  destination: PublicKey;
  lamports: number;
}): Promise<string> {
  const { blockhash, lastValidBlockHeight } =
    await input.connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: input.signer.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey: input.signer.publicKey,
      toPubkey: input.destination,
      lamports: input.lamports,
    })
  );

  transaction.sign(input.signer);

  const signature = await input.connection.sendRawTransaction(
    transaction.serialize(),
    {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    }
  );
  await confirmSolanaSignature(signature);
  return signature;
}

function isMarinadeProviderSelected(): boolean {
  const provider = process.env.SOLANA_STAKING_PROVIDER?.trim().toLowerCase();
  if (!provider) {
    return true;
  }
  return provider === "marinade";
}

async function executeMarinadeWithdrawTransfer(input: {
  connection: Connection;
  payer: Keypair;
  destination: PublicKey;
  lamports: number;
}): Promise<string> {
  const marinade = new Marinade(
    new MarinadeConfig({
      connection: input.connection,
      publicKey: input.payer.publicKey,
    })
  );

  const { transaction } = await marinade.liquidUnstake(
    new MarinadeBN(input.lamports)
  );
  transaction.feePayer = input.payer.publicKey;
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: input.payer.publicKey,
      toPubkey: input.destination,
      lamports: input.lamports,
    })
  );

  const signature = await input.connection.sendTransaction(transaction, [input.payer], {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 3,
  });
  await confirmSolanaSignature(signature);
  return signature;
}

async function settlePayoutWithFallback(input: {
  wallet: string;
  amountSol: number;
  reason?: "collect" | "withdraw";
}): Promise<PayoutSettlement> {
  const lamports = Math.round(input.amountSol * LAMPORTS_PER_SOL);
  if (lamports <= 0) {
    return { settlementSource: "demo_accounting" };
  }

  const destination = new PublicKey(input.wallet);
  const connection = getSolanaConnection();
  const settlementErrors: string[] = [];

  if (input.reason === "withdraw" && isMarinadeProviderSelected()) {
    try {
      const apiPayer = getApiPayer();
      const signature = await executeMarinadeWithdrawTransfer({
        connection,
        payer: apiPayer,
        destination,
        lamports,
      });
      return {
        settlementSource: "api_payer_onchain",
        solanaSignature: signature,
        explorerUrl: toExplorerUrl(signature),
        sourceAddress: apiPayer.publicKey.toBase58(),
      };
    } catch (error) {
      settlementErrors.push(
        `Marinade withdraw failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  try {
    const vaultSigner = getStakeVaultSigner();
    if (vaultSigner) {
      const signature = await sendPayoutTransfer({
        connection,
        signer: vaultSigner,
        destination,
        lamports,
      });
      return {
        settlementSource: "vault_onchain",
        solanaSignature: signature,
        explorerUrl: toExplorerUrl(signature),
        sourceAddress: vaultSigner.publicKey.toBase58(),
      };
    }
    settlementErrors.push("Stake vault signer is not configured.");
  } catch (error) {
    settlementErrors.push(
      `Stake vault payout failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  try {
    const apiPayer = getApiPayer();
    const signature = await sendPayoutTransfer({
      connection,
      signer: apiPayer,
      destination,
      lamports,
    });
    return {
      settlementSource: "api_payer_onchain",
      solanaSignature: signature,
      explorerUrl: toExplorerUrl(signature),
      sourceAddress: apiPayer.publicKey.toBase58(),
    };
  } catch (error) {
    settlementErrors.push(
      `API payer payout failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  console.warn(
    `[stake-payout] Falling back to demo accounting for wallet ${
      input.wallet
    }. ${settlementErrors.join(" | ")}`
  );

  return { settlementSource: "demo_accounting" };
}

export const defaultStakePayoutDeps: StakePayoutDeps = {
  settlePayout: settlePayoutWithFallback,
  getProtocolBaseApy,
};

async function refreshUserStakeSnapshot(
  userId: string,
  deps: StakePayoutDeps
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      greenScore: true,
      stakeVaultAddress: true,
    },
  });
  if (!user) {
    return;
  }

  const score = clampGreenScore(user.greenScore ?? 0);
  const [baseApy, stakedAmount, accruedYield] = await Promise.all([
    deps.getProtocolBaseApy(),
    getNetStakedPrincipalForUser(userId),
    getNetAccruedYieldForUser(userId),
  ]);

  let stakeVaultAddress = user.stakeVaultAddress ?? undefined;
  try {
    stakeVaultAddress = getStakeVaultAddress().toBase58();
  } catch {
    // Leave existing value unchanged when vault env is missing.
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      stakingBaseApy: roundTo(baseApy, 4),
      stakingGreenBonus: roundTo(computeGreenBonus(score), 4),
      stakingEffectiveApy: roundTo(computeEffectiveApyWithBase(score, baseApy), 4),
      stakingStakedAmount: stakedAmount,
      stakingAccruedYield: accruedYield,
      stakeVaultAddress,
      stakingUpdatedAt: new Date(),
    },
  });
}

function toSixDecimals(value: number): number {
  return roundTo(Math.max(0, value), 6);
}

export async function getNetStakedPrincipalForUser(userId: string): Promise<number> {
  const aggregate = await prisma.stakeRecord.aggregate({
    where: {
      userId,
      status: "confirmed",
    },
    _sum: { amount: true },
  });
  return toSixDecimals(aggregate._sum.amount ?? 0);
}

export async function collectStakeYield(
  request: StakeCollectRequest,
  deps: StakePayoutDeps = defaultStakePayoutDeps
): Promise<StakeCollectResponse> {
  const user = await prisma.user.upsert({
    where: { walletAddress: request.wallet },
    update: {},
    create: {
      walletAddress: request.wallet,
      greenScore: 0,
    },
  });

  const collectable = await getNetAccruedYieldForUser(user.id);
  if (collectable <= 0) {
    throw new Error("No accrued yield available to collect.");
  }

  const collectedAmount = toSixDecimals(collectable);
  const settlement = await deps.settlePayout({
    wallet: request.wallet,
    amountSol: collectedAmount,
    reason: "collect",
  });

  await prisma.stakeRecord.create({
    data: {
      userId: user.id,
      walletAddress: request.wallet,
      amount: 0,
      durationDays: 0,
      greenScore: clampGreenScore(user.greenScore ?? 0),
      effectiveApy: roundTo(user.stakingEffectiveApy ?? 0, 4),
      estimatedYield: -collectedAmount,
      solanaTxHash: settlement.solanaSignature,
      vaultAddress: settlement.sourceAddress,
      status: "confirmed",
      provider: `collect_${settlement.settlementSource}`,
    },
  });

  await refreshUserStakeSnapshot(user.id, deps);
  const remainingAccruedYield = await getNetAccruedYieldForUser(user.id);

  return {
    wallet: request.wallet,
    collectedAmount,
    remainingAccruedYield,
    settlementSource: settlement.settlementSource,
    solanaSignature: settlement.solanaSignature,
    explorerUrl: settlement.explorerUrl,
  };
}

export async function withdrawStakePrincipal(
  request: StakeWithdrawRequest,
  deps: StakePayoutDeps = defaultStakePayoutDeps
): Promise<StakeWithdrawResponse> {
  const user = await prisma.user.upsert({
    where: { walletAddress: request.wallet },
    update: {},
    create: {
      walletAddress: request.wallet,
      greenScore: 0,
    },
  });

  const availablePrincipal = await getNetStakedPrincipalForUser(user.id);
  if (availablePrincipal <= 0) {
    throw new Error("No staked principal is available to withdraw.");
  }

  const requestedAmount = toSixDecimals(request.amount);
  if (requestedAmount > availablePrincipal) {
    throw new Error(
      `Withdrawal amount exceeds staked principal (${availablePrincipal.toFixed(6)} SOL available).`
    );
  }

  const settlement = await deps.settlePayout({
    wallet: request.wallet,
    amountSol: requestedAmount,
    reason: "withdraw",
  });

  await prisma.stakeRecord.create({
    data: {
      userId: user.id,
      walletAddress: request.wallet,
      amount: -requestedAmount,
      durationDays: 0,
      greenScore: clampGreenScore(user.greenScore ?? 0),
      effectiveApy: roundTo(user.stakingEffectiveApy ?? 0, 4),
      estimatedYield: 0,
      solanaTxHash: settlement.solanaSignature,
      vaultAddress: settlement.sourceAddress,
      status: "confirmed",
      provider: `withdraw_${settlement.settlementSource}`,
    },
  });

  await refreshUserStakeSnapshot(user.id, deps);
  const remainingStakedAmount = await getNetStakedPrincipalForUser(user.id);

  return {
    wallet: request.wallet,
    withdrawnAmount: requestedAmount,
    remainingStakedAmount,
    settlementSource: settlement.settlementSource,
    solanaSignature: settlement.solanaSignature,
    explorerUrl: settlement.explorerUrl,
  };
}
