/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  CarbonIQ — Solana Service                                              ║
 * ║  Wraps @solana/web3.js + @coral-xyz/anchor for on-chain interactions.   ║
 * ║  Uses the API server wallet (authority) to pay for transactions.        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  clusterApiUrl,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import bs58 from "bs58";
import { CarbonCreditType } from "@carboniq/contracts";
import { carbonIqIdl, type CarbonIq } from "../solana/carbon_iq.js";

type CarbonCreditTypeValue =
  (typeof CarbonCreditType)[keyof typeof CarbonCreditType];
type ProofOfImpactAccount = {
  userWallet: PublicKey;
  co2OffsetAmount: anchor.BN;
  timestamp: anchor.BN;
  creditType: number;
  bump: number;
};

const CREDIT_TYPE_MAP: Record<CarbonCreditTypeValue, number> = {
  [CarbonCreditType.RENEWABLE_ENERGY]: 0,
  [CarbonCreditType.FORESTRY]: 1,
  [CarbonCreditType.METHANE_CAPTURE]: 2,
  [CarbonCreditType.DIRECT_AIR_CAPTURE]: 3,
  [CarbonCreditType.SOIL_CARBON]: 4,
  [CarbonCreditType.OCEAN_BASED]: 5,
};

const CREDIT_TYPE_REVERSE: Record<number, CarbonCreditTypeValue> =
  Object.fromEntries(
    Object.entries(CREDIT_TYPE_MAP).map(([creditType, index]) => [
      index,
      creditType,
    ])
  ) as Record<number, CarbonCreditTypeValue>;

let connection: Connection | null = null;
let payer: Keypair | null = null;
let provider: anchor.AnchorProvider | null = null;
let program: anchor.Program<CarbonIq> | null = null;

export function creditTypeToIndex(creditType: CarbonCreditTypeValue): number {
  const index = CREDIT_TYPE_MAP[creditType];
  if (index === undefined) {
    throw new Error(`Unknown credit type: ${creditType}`);
  }

  return index;
}

export function creditTypeFromIndex(index: number): CarbonCreditTypeValue {
  const creditType = CREDIT_TYPE_REVERSE[index];
  if (!creditType) {
    throw new Error(`Unknown credit type index: ${index}`);
  }

  return creditType;
}

function getProgramId(): string {
  return process.env.SOLANA_PROGRAM_ID || carbonIqIdl.address;
}

function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(
      process.env.SOLANA_RPC_URL || clusterApiUrl("devnet"),
      "confirmed"
    );
  }

  return connection;
}

function getPayer(): Keypair {
  if (!payer) {
    const secretKey = process.env.SOLANA_PAYER_SECRET_KEY;
    if (!secretKey) {
      throw new Error(
        "SOLANA_PAYER_SECRET_KEY env var is required. Set it to the base58-encoded private key of the API payer wallet."
      );
    }

    try {
      payer = Keypair.fromSecretKey(bs58.decode(secretKey));
    } catch {
      try {
        payer = Keypair.fromSecretKey(
          Uint8Array.from(JSON.parse(secretKey) as number[])
        );
      } catch {
        throw new Error(
          "SOLANA_PAYER_SECRET_KEY must be a base58 string or JSON array of bytes."
        );
      }
    }
  }

  return payer;
}

function getProgram(): anchor.Program<CarbonIq> {
  if (!program) {
    const wallet = new anchor.Wallet(getPayer());
    provider = new anchor.AnchorProvider(getConnection(), wallet, {
      commitment: "confirmed",
    });

    const programId = getProgramId();
    const idl: CarbonIq = {
      ...carbonIqIdl,
      address: programId,
      metadata: {
        ...carbonIqIdl.metadata,
        deployments: {
          ...carbonIqIdl.metadata.deployments,
          devnet: programId,
        },
      },
    };

    program = new anchor.Program<CarbonIq>(idl, provider);
  }

  return program;
}

async function confirmSignature(signature: string): Promise<void> {
  await getConnection().confirmTransaction(signature, "confirmed");
}

async function withRetries<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1_000 * (attempt + 1))
        );
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Solana RPC request failed");
}

async function fetchProofOfImpactAccount(
  proofPda: PublicKey
): Promise<ProofOfImpactAccount> {
  const accountNamespace = getProgram().account as unknown as Record<
    string,
    { fetch(address: PublicKey): Promise<unknown> }
  >;

  return accountNamespace.proofOfImpact.fetch(
    proofPda
  ) as Promise<ProofOfImpactAccount>;
}

export function getProofOfImpactPda(userWallet: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("proof"), new PublicKey(userWallet).toBuffer()],
    new PublicKey(getProgramId())
  );

  return pda;
}

export async function recordImpact(
  userWallet: string,
  co2OffsetGrams: number,
  creditType: number
): Promise<{ signature: string; proofOfImpactAddress: string }> {
  const proofPda = getProofOfImpactPda(userWallet);
  const userPubkey = new PublicKey(userWallet);
  const authority = getPayer().publicKey;

  return withRetries(async () => {
    const signature = await getProgram().methods
      .recordImpact(new anchor.BN(co2OffsetGrams), creditType)
      .accountsStrict({
        proofOfImpact: proofPda,
        user: userPubkey,
        authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await confirmSignature(signature);

    return {
      signature,
      proofOfImpactAddress: proofPda.toBase58(),
    };
  });
}

export async function updateImpact(
  userWallet: string,
  additionalOffsetGrams: number,
  creditType: number
): Promise<{ signature: string; cumulativeCo2eGrams: number }> {
  const proofPda = getProofOfImpactPda(userWallet);
  const userPubkey = new PublicKey(userWallet);
  const authority = getPayer().publicKey;

  return withRetries(async () => {
    const signature = await getProgram().methods
      .updateImpact(new anchor.BN(additionalOffsetGrams), creditType)
      .accountsStrict({
        proofOfImpact: proofPda,
        user: userPubkey,
        authority,
      })
      .rpc();

    await confirmSignature(signature);

    const account = await fetchProofOfImpactAccount(proofPda);

    return {
      signature,
      cumulativeCo2eGrams: account.co2OffsetAmount.toNumber(),
    };
  });
}

export async function getProofOfImpact(
  userWallet: string
): Promise<{
  co2OffsetAmount: number;
  creditType: number;
  timestamp: number;
} | null> {
  const proofPda = getProofOfImpactPda(userWallet);
  const accountInfo = await getConnection().getAccountInfo(proofPda);
  if (!accountInfo) {
    return null;
  }

  const account = await fetchProofOfImpactAccount(proofPda);

  return {
    co2OffsetAmount: account.co2OffsetAmount.toNumber(),
    creditType: account.creditType,
    timestamp: account.timestamp.toNumber(),
  };
}

export async function proofExists(userWallet: string): Promise<boolean> {
  const proofPda = getProofOfImpactPda(userWallet);
  const accountInfo = await getConnection().getAccountInfo(proofPda);
  return accountInfo !== null;
}

export async function getPayerBalance(): Promise<number> {
  const balance = await getConnection().getBalance(getPayer().publicKey);
  return balance / 1e9;
}
