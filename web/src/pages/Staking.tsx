import { type ChangeEvent, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Slider } from "@/components/ui/Slider";
import { useGreenScore } from "@/hooks/useGreenScore";
import { parseUploadFile, type DemoMode, type DemoTransactionInput } from "@/lib/demoBank";
import { isUploadRefreshRequired, markUploadCompleted, uploadEpochGate } from "@/lib/uploadEpochGate";
import { Landmark, PenLine, Sparkles } from "lucide-react";

interface SimulateStakeResponse {
  principal: number;
  durationDays: number;
  baseApy: number;
  greenBonus: number;
  effectiveApy: number;
  estimatedYield: number;
  totalReturn: number;
}

interface StakeResponse {
  wallet: string;
  amount: number;
  durationDays: number;
  greenScore: number;
  effectiveApy: number;
  estimatedYield: number;
  vaultAddress: string;
  solanaSignature: string;
  status: "confirmed" | "failed";
}

interface StakingInfoResponse {
  wallet: string;
  greenScore: number;
  baseApy: number;
  greenBonus: number;
  effectiveApy: number;
  stakedAmount: number;
  accruedYield: number;
  stakeVaultAddress?: string;
}

interface AnalyzeResponse {
  wallet: string;
  transactionCount: number;
  transactions: Array<{
    transactionId: string;
  }>;
}

interface DemoConnectBankResponse {
  wallet: string;
  mode: DemoMode;
  sourceLabel: string;
  transactionCount: number;
  connectedAt: string;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error.";
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body?.error === "string") {
        message = body.error;
      }
    } catch {
      // fallback message
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function hasNonSeededTransactions(response: AnalyzeResponse): boolean {
  if (response.transactionCount <= 0) {
    return false;
  }
  return response.transactions.some(
    (transaction) => !transaction.transactionId.startsWith("seeded_")
  );
}

export default function Staking() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const { data: greenScore } = useGreenScore(wallet);

  const [amount, setAmount] = useState(1);
  const [duration, setDuration] = useState(30);
  const [simulation, setSimulation] = useState<SimulateStakeResponse | null>(null);
  const [stakeResult, setStakeResult] = useState<StakeResponse | null>(null);
  const [stakingInfo, setStakingInfo] = useState<StakingInfoResponse | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isStaking, setIsStaking] = useState(false);
  const [isCheckingTransactions, setIsCheckingTransactions] = useState(false);
  const [hasBankTransactions, setHasBankTransactions] = useState<boolean | null>(null);
  const [uploadRefreshRequired, setUploadRefreshRequired] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadedTransactions, setUploadedTransactions] =
    useState<DemoTransactionInput[] | null>(null);
  const [uploadSummary, setUploadSummary] = useState("");
  const [isUploadingLedger, setIsUploadingLedger] = useState(false);
  const [uploadGateError, setUploadGateError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const score = greenScore?.score ?? 0;
  const stakingBlocked =
    Boolean(wallet) &&
    !isCheckingTransactions &&
    (hasBankTransactions !== true || uploadRefreshRequired);

  useEffect(() => {
    if (!wallet) {
      setIsCheckingTransactions(false);
      setHasBankTransactions(null);
      setUploadRefreshRequired(false);
      setShowUploadModal(false);
      setUploadedTransactions(null);
      setUploadSummary("");
      setUploadGateError("");
      return;
    }

    let cancelled = false;
    setIsCheckingTransactions(true);
    void (async () => {
      try {
        const response = await requestJson<AnalyzeResponse>("/api/analyze-transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet, limit: 1 }),
        });
        const hasTransactions = hasNonSeededTransactions(response);
        const refreshRequired = isUploadRefreshRequired(wallet);
        if (!cancelled) {
          setHasBankTransactions(hasTransactions);
          setUploadRefreshRequired(refreshRequired);
          setShowUploadModal(!hasTransactions || refreshRequired);
        }
      } catch {
        if (!cancelled) {
          setHasBankTransactions(false);
          setUploadRefreshRequired(true);
          setShowUploadModal(true);
        }
      } finally {
        if (!cancelled) {
          setIsCheckingTransactions(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wallet]);

  async function handleUploadForGate(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = await parseUploadFile(file);
      setUploadedTransactions(parsed);
      setUploadSummary(`Loaded ${parsed.length} transactions from ${file.name}`);
      setUploadGateError("");
    } catch (uploadError) {
      setUploadedTransactions(null);
      setUploadSummary("");
      setUploadGateError(formatError(uploadError));
    } finally {
      event.target.value = "";
    }
  }

  async function handleUploadAndUnlock() {
    if (!wallet) {
      setUploadGateError("Connect your wallet first.");
      return;
    }
    if (!uploadedTransactions) {
      setUploadGateError("Upload a JSON or CSV file first.");
      return;
    }

    setUploadGateError("");
    setIsUploadingLedger(true);
    try {
      const response = await requestJson<DemoConnectBankResponse>("/api/demo/connect-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet,
          mode: "upload",
          transactions: uploadedTransactions,
        }),
      });

      if (response.transactionCount > 0) {
        setHasBankTransactions(true);
        markUploadCompleted(wallet, response.connectedAt);
        setUploadRefreshRequired(false);
        setShowUploadModal(false);
        setMessage("Transactions uploaded. Staking is now unlocked.");
      } else {
        setUploadGateError("No transactions were uploaded. Please try another file.");
      }
    } catch (uploadError) {
      setUploadGateError(formatError(uploadError));
    } finally {
      setIsUploadingLedger(false);
    }
  }

  async function simulate() {
    setError("");
    setMessage("");
    setIsSimulating(true);
    try {
      const response = await fetch("/api/simulate-stake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          durationDays: duration,
          greenScore: score,
        }),
      });
      if (!response.ok) {
        throw new Error(`Simulation failed (${response.status})`);
      }
      const json = (await response.json()) as SimulateStakeResponse;
      setSimulation(json);
    } catch (simulationError) {
      setError(formatError(simulationError));
    } finally {
      setIsSimulating(false);
    }
  }

  async function signAndStake() {
    if (!wallet || !publicKey || !sendTransaction) {
      setError("Connect a wallet with signing support first.");
      return;
    }
    if (isCheckingTransactions) {
      setError("Checking transaction freshness. Please wait a moment.");
      return;
    }
    if (stakingBlocked) {
      setShowUploadModal(true);
      setError("Upload recent transactions before staking.");
      return;
    }

    setError("");
    setMessage("");
    setIsStaking(true);

    try {
      const infoRes = await fetch(`/api/staking-info?wallet=${wallet}`);
      if (!infoRes.ok) {
        throw new Error(`Failed to fetch staking info (${infoRes.status})`);
      }
      const info = (await infoRes.json()) as StakingInfoResponse;
      if (!info.stakeVaultAddress) {
        throw new Error("Stake vault address is not configured.");
      }

      const lamports = Math.round(amount * LAMPORTS_PER_SOL);
      if (lamports <= 0) {
        throw new Error("Stake amount is too small.");
      }

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      const vaultPubkey = new PublicKey(info.stakeVaultAddress);

      const transaction = new Transaction({
        feePayer: publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: vaultPubkey,
          lamports,
        })
      );

      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      const stakeResponse = await fetch("/api/stake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet,
          amount,
          durationDays: duration,
          solanaSignature: signature,
        }),
      });
      if (!stakeResponse.ok) {
        const body = await stakeResponse.json().catch(() => null);
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : `Stake record failed (${stakeResponse.status})`
        );
      }

      const json = (await stakeResponse.json()) as StakeResponse;
      setStakeResult(json);
      setMessage(`Stake confirmed with wallet signature ${json.solanaSignature}`);

      const updatedInfoRes = await fetch(`/api/staking-info?wallet=${wallet}`);
      if (updatedInfoRes.ok) {
        setStakingInfo((await updatedInfoRes.json()) as StakingInfoResponse);
      }
    } catch (stakeError) {
      setError(formatError(stakeError));
    } finally {
      setIsStaking(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Green Staking</h1>
        <p className="text-gray-400 mt-1">
          Simulate APY, then sign and submit staking transfer from your wallet.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-accent-emerald" />
              Stake SOL
            </CardTitle>
            <CardDescription>
              Current Green Score:{" "}
              <span className="text-accent-emerald font-semibold">
                {score.toFixed(2)}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Amount (SOL)</span>
                <span className="font-mono text-accent-emerald">{amount}</span>
              </div>
              <Slider
                min={0.1}
                max={100}
                step={0.1}
                value={[amount]}
                onValueChange={([v]) => v !== undefined && setAmount(v)}
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Duration (days)</span>
                <span className="font-mono text-accent-emerald">{duration}</span>
              </div>
              <Slider
                min={7}
                max={365}
                step={1}
                value={[duration]}
                onValueChange={([v]) => v !== undefined && setDuration(v)}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button size="lg" disabled={isSimulating} onClick={simulate}>
                <Sparkles className="h-4 w-4" />
                {isSimulating ? "Simulating..." : "Simulate Yield"}
              </Button>
              <Button
                size="lg"
                variant="secondary"
                disabled={isStaking || stakingBlocked || isCheckingTransactions}
                onClick={signAndStake}
              >
                <PenLine className="h-4 w-4" />
                {isStaking ? "Signing + Staking..." : "Sign & Stake"}
              </Button>
            </div>
            {wallet && stakingBlocked && (
              <p className="text-sm text-solar-400">
                Upload recent transactions every {uploadEpochGate.refreshWindowDays} days
                to unlock staking.
              </p>
            )}
            {error && <p className="text-sm text-clay-400">{error}</p>}
            {message && <p className="text-sm text-forest-300">{message}</p>}
          </CardContent>
        </Card>

        <Card className={simulation || stakeResult ? "glow-green" : ""}>
          <CardHeader>
            <CardTitle>Yield + Status</CardTitle>
          </CardHeader>
          <CardContent>
            {simulation ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-surface-300/50">
                  <span className="text-sm text-gray-400">Base APY</span>
                  <span className="font-mono font-semibold text-white">
                    {simulation.baseApy.toFixed(4)}%
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-surface-300/50">
                  <span className="text-sm text-gray-400">Green Bonus</span>
                  <span className="font-mono font-semibold text-accent-emerald">
                    +{simulation.greenBonus.toFixed(4)}%
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-surface-300/50">
                  <span className="text-sm text-gray-400">Effective APY</span>
                  <span className="font-mono font-semibold text-white">
                    {simulation.effectiveApy.toFixed(4)}%
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-surface-300/50">
                  <span className="text-sm text-gray-400">Estimated Yield</span>
                  <span className="font-mono font-semibold text-accent-emerald">
                    {simulation.estimatedYield.toFixed(6)} SOL
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-400">Total Return</span>
                  <span className="font-mono text-xl gradient-text">
                    {simulation.totalReturn.toFixed(6)} SOL
                  </span>
                </div>
                {stakeResult && (
                  <div className="rounded-lg border border-stone-700 bg-surface-900/40 p-3">
                    <p className="text-xs text-stone-400">Latest Stake Signature</p>
                    <p className="font-mono text-xs break-all text-forest-300">
                      {stakeResult.solanaSignature}
                    </p>
                  </div>
                )}
                {stakingInfo && (
                  <p className="text-xs text-stone-500">
                    Total staked: {stakingInfo.stakedAmount.toFixed(4)} SOL | Accrued
                    yield: {stakingInfo.accruedYield.toFixed(6)} SOL
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-gray-500 text-sm">
                <Landmark className="h-8 w-8 mb-3 opacity-30" />
                Configure inputs and simulate, then sign to stake
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {wallet && showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-surface-950/85 backdrop-blur-sm"
            onClick={() => setShowUploadModal(false)}
            aria-label="Close upload prompt"
          />
          <Card className="relative z-10 w-full max-w-lg border-forest-600/35">
            <CardHeader>
              <CardTitle>Upload Transactions Before Staking</CardTitle>
              <CardDescription>
                {hasBankTransactions === true && uploadRefreshRequired
                  ? `Your last upload is older than ${uploadEpochGate.refreshWindowDays} days. Upload a fresh transaction file to keep staking enabled.`
                  : "We need recent transaction data to calculate your green booster before you stake."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                type="file"
                accept=".json,.csv"
                onChange={handleUploadForGate}
                className="block w-full rounded-lg border border-stone-800 bg-surface-950/60 px-3 py-2 text-sm text-stone-300 file:mr-3 file:rounded-md file:border-0 file:bg-forest-600 file:px-3 file:py-1.5 file:text-white file:font-medium"
              />
              {uploadSummary && <p className="text-xs text-stone-400">{uploadSummary}</p>}
              {uploadGateError && <p className="text-sm text-clay-400">{uploadGateError}</p>}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleUploadAndUnlock}
                  disabled={isUploadingLedger || !uploadedTransactions}
                >
                  {isUploadingLedger ? "Uploading..." : "Upload + Unlock Staking"}
                </Button>
                <Button variant="outline" onClick={() => setShowUploadModal(false)}>
                  Later
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
