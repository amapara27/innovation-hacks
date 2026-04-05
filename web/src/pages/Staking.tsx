import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Clock3,
  ExternalLink,
  Landmark,
  PenLine,
  Sparkles,
  TimerReset,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Slider } from "@/components/ui/Slider";
import { useWalletState } from "@/hooks/useWalletState";
import {
  formatError,
  requestJson,
  type GreenScoreData,
  type SimulateStakeTimelineResponse,
  type StakeCollectResponse,
  type StakeSettlementSource,
  type StakeWithdrawResponse,
  type StakingInfoResponse,
} from "@/lib/api";
import {
  parseUploadFile,
  type DemoMode,
  type DemoTransactionInput,
} from "@/lib/demoBank";
import {
  isUploadRefreshRequiredForTimestamp,
  markUploadCompleted,
  uploadEpochGate,
} from "@/lib/uploadEpochGate";

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

interface DemoConnectBankResponse {
  wallet: string;
  mode: DemoMode;
  sourceLabel: string;
  transactionCount: number;
  connectedAt: string;
}

type TimelineRunContext = {
  principal: number;
  currentAccruedYield: number;
  greenScore: number;
};

type LatestPayout =
  | { kind: "collect"; data: StakeCollectResponse }
  | { kind: "withdraw"; data: StakeWithdrawResponse };

const STAKING_GREEN_BONUS_MAX = 2.5;
const DEFAULT_BASE_APY = 6.1;

function clampAmount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.1;
  }

  return Math.min(100, Math.max(0.1, Number(value.toFixed(1))));
}

function clampDuration(value: number): number {
  if (!Number.isFinite(value)) {
    return 7;
  }

  return Math.min(365, Math.max(7, Math.round(value)));
}

function clampWithdrawAmount(value: number, maxAvailable: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const safeMax = Math.max(0, maxAvailable);
  if (safeMax === 0) {
    return 0;
  }

  return Math.min(safeMax, Math.max(0.000001, Number(value.toFixed(6))));
}

function clampGreenScoreValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function projectStakeOutcome(input: {
  principal: number;
  durationDays: number;
  greenScore: number;
  baseApy: number;
}) {
  const normalizedScore = Math.max(0, Math.min(100, input.greenScore)) / 100;
  const greenBonus = STAKING_GREEN_BONUS_MAX * Math.pow(normalizedScore, 1.5);
  const effectiveApy = input.baseApy + greenBonus;
  const estimatedYield =
    input.principal * (effectiveApy / 100) * (input.durationDays / 365);

  return {
    greenBonus,
    effectiveApy,
    estimatedYield,
    totalReturn: input.principal + estimatedYield,
  };
}

function settlementSourceLabel(source: StakeSettlementSource): string {
  if (source === "vault_onchain") {
    return "Vault On-Chain";
  }
  if (source === "api_payer_onchain") {
    return "API Payer On-Chain";
  }
  return "Demo Accounting";
}

function settlementSourceClasses(source: StakeSettlementSource): string {
  if (source === "vault_onchain") {
    return "border-forest-700/35 bg-forest-700/15 text-forest-300";
  }
  if (source === "api_payer_onchain") {
    return "border-solar-700/40 bg-solar-700/15 text-solar-300";
  }
  return "border-stone-700/50 bg-surface-900/40 text-stone-300";
}

export default function Staking() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const {
    data: walletState,
    isLoading: isHydratingState,
    error: walletStateError,
    refetch: refetchWalletState,
  } = useWalletState(wallet);

  const [amount, setAmount] = useState(1);
  const [duration, setDuration] = useState(30);
  const [comparisonLowScore, setComparisonLowScore] = useState(25);
  const [comparisonHighScore, setComparisonHighScore] = useState(85);
  const [withdrawAmount, setWithdrawAmount] = useState(0);
  const [simulation, setSimulation] = useState<SimulateStakeResponse | null>(null);
  const [stakeResult, setStakeResult] = useState<StakeResponse | null>(null);
  const [latestPayout, setLatestPayout] = useState<LatestPayout | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadedTransactions, setUploadedTransactions] =
    useState<DemoTransactionInput[] | null>(null);
  const [uploadSummary, setUploadSummary] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [isStaking, setIsStaking] = useState(false);
  const [stakingMode, setStakingMode] = useState<"marinade" | "wallet" | null>(
    null
  );
  const [isCollecting, setIsCollecting] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isUploadingLedger, setIsUploadingLedger] = useState(false);
  const [uploadGateError, setUploadGateError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [timelineUploadTransactions, setTimelineUploadTransactions] =
    useState<DemoTransactionInput[] | null>(null);
  const [timelineUploadSummary, setTimelineUploadSummary] = useState("");
  const [timelineRunContext, setTimelineRunContext] = useState<TimelineRunContext | null>(
    null
  );
  const [timelineHorizonDays, setTimelineHorizonDays] = useState(0);
  const [timelineResult, setTimelineResult] = useState<SimulateStakeTimelineResponse | null>(
    null
  );
  const [isStartingTimelineRun, setIsStartingTimelineRun] = useState(false);
  const [isAdvancingTimeline, setIsAdvancingTimeline] = useState(false);
  const [timelineMessage, setTimelineMessage] = useState("");
  const [timelineError, setTimelineError] = useState("");

  const greenScore = walletState?.greenScore;
  const stakingInfo = walletState?.stakingInfo as StakingInfoResponse | null;
  const score = greenScore?.score ?? 0;
  const hasUploadedTransactions = walletState?.hasUploadedTransactions ?? false;
  const uploadRefreshRequired = useMemo(
    () => isUploadRefreshRequiredForTimestamp(walletState?.latestUploadAt),
    [walletState?.latestUploadAt]
  );
  const stakingBlocked =
    Boolean(wallet) &&
    !isHydratingState &&
    (!hasUploadedTransactions || uploadRefreshRequired);
  const explorerUrl = stakeResult?.solanaSignature
    ? `https://explorer.solana.com/tx/${stakeResult.solanaSignature}?cluster=devnet`
    : null;
  const maxWithdrawable = stakingInfo?.stakedAmount ?? 0;
  const canCollect = (stakingInfo?.accruedYield ?? 0) > 0;
  const canWithdraw = maxWithdrawable > 0;
  const timelinePoints = timelineResult?.points ?? [];
  const timelineRunReady = timelineRunContext !== null;
  const comparisonBaseApy =
    simulation?.baseApy ?? stakingInfo?.baseApy ?? DEFAULT_BASE_APY;
  const lowScoreProjection = useMemo(
    () =>
      projectStakeOutcome({
        principal: amount,
        durationDays: duration,
        greenScore: comparisonLowScore,
        baseApy: comparisonBaseApy,
      }),
    [amount, duration, comparisonLowScore, comparisonBaseApy]
  );
  const highScoreProjection = useMemo(
    () =>
      projectStakeOutcome({
        principal: amount,
        durationDays: duration,
        greenScore: comparisonHighScore,
        baseApy: comparisonBaseApy,
      }),
    [amount, duration, comparisonHighScore, comparisonBaseApy]
  );
  const projectedYieldDelta = Number(
    (highScoreProjection.estimatedYield - lowScoreProjection.estimatedYield).toFixed(6)
  );

  useEffect(() => {
    setWithdrawAmount((current) => clampWithdrawAmount(current, maxWithdrawable));
  }, [maxWithdrawable]);

  useEffect(() => {
    if (!wallet) {
      setShowUploadModal(false);
      setUploadedTransactions(null);
      setUploadSummary("");
      setComparisonLowScore(25);
      setComparisonHighScore(85);
      setUploadGateError("");
      setSimulation(null);
      setStakeResult(null);
      setLatestPayout(null);
      setError("");
      setMessage("");
      setStakingMode(null);
      setTimelineUploadTransactions(null);
      setTimelineUploadSummary("");
      setTimelineRunContext(null);
      setTimelineHorizonDays(0);
      setTimelineResult(null);
      setTimelineError("");
      setTimelineMessage("");
      return;
    }

    if (!isHydratingState) {
      setShowUploadModal(stakingBlocked);
    }
  }, [wallet, isHydratingState, stakingBlocked]);

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
        markUploadCompleted(wallet, response.connectedAt);
        await refetchWalletState();
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
      const response = await requestJson<SimulateStakeResponse>("/api/simulate-stake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          durationDays: duration,
          greenScore: score,
        }),
      });

      setSimulation(response);
    } catch (simulationError) {
      setError(formatError(simulationError));
    } finally {
      setIsSimulating(false);
    }
  }

  async function signAndStake() {
    if (!wallet) {
      setError("Connect your wallet first.");
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
    setStakingMode("marinade");

    try {
      const response = await requestJson<StakeResponse>("/api/stake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet,
          amount,
          durationDays: duration,
        }),
      });

      setStakeResult(response);
      setLatestPayout(null);
      setMessage("Stake confirmed on devnet.");
      await refetchWalletState();
    } catch (stakeError) {
      setError(formatError(stakeError));
    } finally {
      setIsStaking(false);
      setStakingMode(null);
    }
  }

  async function walletSignAndStake() {
    if (!wallet || !publicKey || !sendTransaction) {
      setError("Connect a wallet with signing support first.");
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
    setStakingMode("wallet");

    try {
      const info = await requestJson<StakingInfoResponse>(
        `/api/staking-info?wallet=${encodeURIComponent(wallet)}`
      );
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

      const response = await requestJson<StakeResponse>("/api/stake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet,
          amount,
          durationDays: duration,
          solanaSignature: signature,
        }),
      });

      setStakeResult(response);
      setLatestPayout(null);
      setMessage("Wallet-signed stake confirmed on devnet.");
      await refetchWalletState();
    } catch (stakeError) {
      setError(formatError(stakeError));
    } finally {
      setIsStaking(false);
      setStakingMode(null);
    }
  }

  async function collectYield() {
    if (!wallet) {
      setError("Connect your wallet first.");
      return;
    }

    setError("");
    setMessage("");
    setIsCollecting(true);

    try {
      const response = await requestJson<StakeCollectResponse>("/api/stake/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet }),
      });

      setLatestPayout({ kind: "collect", data: response });
      setMessage(`Collected ${response.collectedAmount.toFixed(6)} SOL from accrued yield.`);
      await refetchWalletState();
    } catch (collectError) {
      setError(formatError(collectError));
    } finally {
      setIsCollecting(false);
    }
  }

  async function withdrawPrincipal() {
    if (!wallet) {
      setError("Connect your wallet first.");
      return;
    }

    const requestedAmount = clampWithdrawAmount(withdrawAmount, maxWithdrawable);
    if (requestedAmount <= 0) {
      setError("Enter a valid withdraw amount.");
      return;
    }

    setError("");
    setMessage("");
    setIsWithdrawing(true);

    try {
      const response = await requestJson<StakeWithdrawResponse>("/api/stake/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet,
          amount: requestedAmount,
        }),
      });

      setLatestPayout({ kind: "withdraw", data: response });
      setMessage(`Withdrew ${response.withdrawnAmount.toFixed(6)} SOL from principal.`);
      await refetchWalletState();
      setWithdrawAmount((current) =>
        clampWithdrawAmount(Math.min(current, response.remainingStakedAmount), response.remainingStakedAmount)
      );
    } catch (withdrawError) {
      setError(formatError(withdrawError));
    } finally {
      setIsWithdrawing(false);
    }
  }

  async function handleTimelineUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = await parseUploadFile(file);
      setTimelineUploadTransactions(parsed);
      setTimelineUploadSummary(`Loaded ${parsed.length} transactions from ${file.name}`);
      setTimelineError("");
    } catch (uploadError) {
      setTimelineUploadTransactions(null);
      setTimelineUploadSummary("");
      setTimelineError(formatError(uploadError));
    } finally {
      event.target.value = "";
    }
  }

  async function startTimelineRun() {
    if (!wallet) {
      setTimelineError("Connect your wallet first.");
      return;
    }

    if (!timelineUploadTransactions) {
      setTimelineError("Upload a transaction file to start this simulation run.");
      return;
    }

    setTimelineError("");
    setTimelineMessage("");
    setIsStartingTimelineRun(true);

    try {
      const connectResponse = await requestJson<DemoConnectBankResponse>(
        "/api/demo/connect-bank",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet,
            mode: "upload",
            transactions: timelineUploadTransactions,
          }),
        }
      );

      markUploadCompleted(wallet, connectResponse.connectedAt);

      const [scoreResponse, stakeInfo] = await Promise.all([
        requestJson<GreenScoreData>(`/api/green-score?wallet=${encodeURIComponent(wallet)}`),
        requestJson<StakingInfoResponse>(
          `/api/staking-info?wallet=${encodeURIComponent(wallet)}`
        ),
      ]);

      setTimelineRunContext({
        principal: stakeInfo.stakedAmount,
        currentAccruedYield: stakeInfo.accruedYield,
        greenScore: scoreResponse.score,
      });
      setTimelineHorizonDays(0);
      setTimelineResult(null);
      setTimelineMessage(
        `Run started with uploaded file (${connectResponse.transactionCount} transactions).`
      );
      await refetchWalletState();
    } catch (timelineRunError) {
      setTimelineError(formatError(timelineRunError));
    } finally {
      setIsStartingTimelineRun(false);
    }
  }

  async function advanceTimeline(days: number) {
    if (!timelineRunContext) {
      setTimelineError("Start a simulation run first.");
      return;
    }

    const nextHorizonDays = Math.min(365, timelineHorizonDays + days);
    if (nextHorizonDays === timelineHorizonDays) {
      return;
    }

    setTimelineError("");
    setIsAdvancingTimeline(true);

    try {
      const response = await requestJson<SimulateStakeTimelineResponse>(
        "/api/simulate-stake-timeline",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            principal: timelineRunContext.principal,
            currentAccruedYield: timelineRunContext.currentAccruedYield,
            greenScore: timelineRunContext.greenScore,
            horizonDays: nextHorizonDays,
          }),
        }
      );
      setTimelineHorizonDays(nextHorizonDays);
      setTimelineResult(response);
    } catch (timelineAdvanceError) {
      setTimelineError(formatError(timelineAdvanceError));
    } finally {
      setIsAdvancingTimeline(false);
    }
  }

  function resetTimelineRun() {
    setTimelineRunContext(null);
    setTimelineHorizonDays(0);
    setTimelineResult(null);
    setTimelineUploadTransactions(null);
    setTimelineUploadSummary("");
    setTimelineMessage("");
    setTimelineError("");
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Green Staking</h1>
        <p className="text-gray-400 mt-1">
          Stake with Marinade or wallet-sign a stake tx, withdraw on-chain, and simulate
          low-score earnings impact.
        </p>
      </div>

      {!wallet && (
        <Card>
          <CardHeader>
            <CardTitle>Connect Wallet to Continue</CardTitle>
            <CardDescription>
              Connect your wallet from the sidebar to load your staking state.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {wallet && isHydratingState && (
        <Card>
          <CardHeader>
            <CardTitle>Loading Staking State</CardTitle>
            <CardDescription>
              Restoring your latest uploads, score, and staking position from Mongo.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {wallet && walletStateError && !isHydratingState && (
        <Card>
          <CardHeader>
            <CardTitle>State Load Error</CardTitle>
            <CardDescription>{walletStateError}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-accent-emerald" />
              Stake SOL
            </CardTitle>
            <CardDescription>
              Current Green Score:{" "}
              <span className="text-accent-emerald font-semibold">{score.toFixed(2)}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-gray-400">Amount (SOL)</span>
                <input
                  type="number"
                  min={0.1}
                  max={100}
                  step={0.1}
                  value={amount}
                  onChange={(event) => setAmount(clampAmount(Number(event.target.value)))}
                  className="w-28 rounded-lg border border-stone-800 bg-surface-950/60 px-3 py-2 text-right text-sm text-stone-200"
                />
              </div>
              <Slider
                min={0.1}
                max={100}
                step={0.1}
                value={[amount]}
                onValueChange={([value]) => value !== undefined && setAmount(clampAmount(value))}
              />
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-gray-400">Duration (days)</span>
                <input
                  type="number"
                  min={7}
                  max={365}
                  step={1}
                  value={duration}
                  onChange={(event) => setDuration(clampDuration(Number(event.target.value)))}
                  className="w-28 rounded-lg border border-stone-800 bg-surface-950/60 px-3 py-2 text-right text-sm text-stone-200"
                />
              </div>
              <Slider
                min={7}
                max={365}
                step={1}
                value={[duration]}
                onValueChange={([value]) =>
                  value !== undefined && setDuration(clampDuration(value))
                }
              />
            </div>

            <div className="rounded-lg border border-stone-800 bg-surface-900/35 p-4 space-y-4">
              <div>
                <p className="text-sm text-stone-200 font-medium">Green Score Yield Comparison</p>
                <p className="text-xs text-stone-500">
                  Move the sliders to preview how yield changes with lower vs higher scores.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-400">
                  <span>Lower score</span>
                  <span>{comparisonLowScore}</span>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[comparisonLowScore]}
                  onValueChange={([value]) => {
                    if (value === undefined) {
                      return;
                    }
                    const clamped = clampGreenScoreValue(value);
                    setComparisonLowScore(Math.min(clamped, comparisonHighScore));
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-400">
                  <span>Higher score</span>
                  <span>{comparisonHighScore}</span>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[comparisonHighScore]}
                  onValueChange={([value]) => {
                    if (value === undefined) {
                      return;
                    }
                    const clamped = clampGreenScoreValue(value);
                    setComparisonHighScore(Math.max(clamped, comparisonLowScore));
                  }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-stone-800/80 bg-surface-950/40 p-3 space-y-1">
                  <p className="text-xs text-stone-400">Score {comparisonLowScore}</p>
                  <p className="text-sm text-stone-200">
                    APY {lowScoreProjection.effectiveApy.toFixed(4)}%
                  </p>
                  <p className="text-xs text-stone-400">
                    Yield {lowScoreProjection.estimatedYield.toFixed(6)} SOL
                  </p>
                </div>
                <div className="rounded-lg border border-stone-800/80 bg-surface-950/40 p-3 space-y-1">
                  <p className="text-xs text-stone-400">Score {comparisonHighScore}</p>
                  <p className="text-sm text-stone-200">
                    APY {highScoreProjection.effectiveApy.toFixed(4)}%
                  </p>
                  <p className="text-xs text-stone-400">
                    Yield {highScoreProjection.estimatedYield.toFixed(6)} SOL
                  </p>
                </div>
              </div>

              <p className="text-sm text-forest-300">
                Yield difference over {duration} days: +{projectedYieldDelta.toFixed(6)} SOL
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button size="lg" disabled={isSimulating || !wallet} onClick={simulate}>
                <Sparkles className="h-4 w-4" />
                {isSimulating ? "Simulating..." : "Simulate Yield"}
              </Button>
              <Button
                size="lg"
                variant="secondary"
                disabled={isStaking || stakingBlocked || isHydratingState || !wallet}
                onClick={signAndStake}
              >
                <PenLine className="h-4 w-4" />
                {isStaking && stakingMode === "marinade"
                  ? "Staking via Marinade..."
                  : "Stake via Marinade"}
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={isStaking || stakingBlocked || isHydratingState || !wallet}
                onClick={walletSignAndStake}
              >
                <PenLine className="h-4 w-4" />
                {isStaking && stakingMode === "wallet"
                  ? "Waiting For Wallet Signature..."
                  : "Wallet Sign & Stake"}
              </Button>
            </div>

            <div className="rounded-lg border border-stone-800 bg-surface-900/35 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-stone-300">Collect Accrued Yield</p>
                  <p className="text-xs text-stone-500">
                    Available: {(stakingInfo?.accruedYield ?? 0).toFixed(6)} SOL
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={collectYield}
                  disabled={!wallet || isCollecting || !canCollect}
                >
                  <ArrowDownCircle className="h-4 w-4" />
                  {isCollecting ? "Collecting..." : "Collect Yield"}
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-stone-300">Withdraw Principal</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={maxWithdrawable}
                    step={0.000001}
                    value={withdrawAmount}
                    onChange={(event) =>
                      setWithdrawAmount(
                        clampWithdrawAmount(Number(event.target.value), maxWithdrawable)
                      )
                    }
                    className="w-44 rounded-lg border border-stone-800 bg-surface-950/60 px-3 py-2 text-right text-sm text-stone-200"
                  />
                  <Button
                    variant="outline"
                    onClick={withdrawPrincipal}
                    disabled={!wallet || isWithdrawing || !canWithdraw}
                  >
                    <ArrowUpCircle className="h-4 w-4" />
                    {isWithdrawing ? "Withdrawing..." : "Withdraw"}
                  </Button>
                </div>
                <p className="text-xs text-stone-500">
                  Max withdrawable: {maxWithdrawable.toFixed(6)} SOL
                </p>
              </div>
            </div>

            {wallet && stakingBlocked && !isHydratingState && (
              <p className="text-sm text-solar-400">
                Upload recent transactions every {uploadEpochGate.refreshWindowDays} days to
                keep staking enabled.
              </p>
            )}
            {error && <p className="text-sm text-clay-400">{error}</p>}
            {message && <p className="text-sm text-forest-300">{message}</p>}
          </CardContent>
        </Card>

        <Card className={simulation || stakeResult || latestPayout ? "glow-green" : ""}>
          <CardHeader>
            <CardTitle>Yield + Status</CardTitle>
          </CardHeader>
          <CardContent>
            {simulation || stakeResult || latestPayout ? (
              <div className="space-y-4">
                {simulation && (
                  <>
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
                  </>
                )}

                {stakeResult && (
                  <div className="rounded-lg border border-stone-700 bg-surface-900/40 p-3 space-y-2">
                    <p className="text-xs text-stone-400">Latest Stake Signature</p>
                    <p className="font-mono text-xs break-all text-forest-300">
                      {stakeResult.solanaSignature}
                    </p>
                    {explorerUrl && (
                      <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-forest-300 hover:text-forest-200"
                      >
                        View on Solana Explorer
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                )}

                {latestPayout && (
                  <div className="rounded-lg border border-stone-700 bg-surface-900/40 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-stone-400">
                        Latest {latestPayout.kind === "collect" ? "Collect" : "Withdraw"}
                      </p>
                      <span
                        className={`rounded-full border px-2 py-1 text-xs font-medium ${settlementSourceClasses(
                          latestPayout.data.settlementSource
                        )}`}
                      >
                        {settlementSourceLabel(latestPayout.data.settlementSource)}
                      </span>
                    </div>
                    <p className="text-sm text-stone-200">
                      {latestPayout.kind === "collect"
                        ? `Collected ${latestPayout.data.collectedAmount.toFixed(6)} SOL`
                        : `Withdrew ${latestPayout.data.withdrawnAmount.toFixed(6)} SOL`}
                    </p>
                    {latestPayout.data.solanaSignature && (
                      <p className="font-mono text-xs break-all text-stone-300">
                        {latestPayout.data.solanaSignature}
                      </p>
                    )}
                    {latestPayout.data.explorerUrl && (
                      <a
                        href={latestPayout.data.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-forest-300 hover:text-forest-200"
                      >
                        View payout on Solana Explorer
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                )}

                {stakingInfo && (
                  <p className="text-xs text-stone-500">
                    Total staked: {stakingInfo.stakedAmount.toFixed(4)} SOL | Accrued yield:{" "}
                    {stakingInfo.accruedYield.toFixed(6)} SOL
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-gray-500 text-sm">
                <Landmark className="h-8 w-8 mb-3 opacity-30" />
                Configure inputs and simulate, then sign to stake.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-solar-300" />
            Simulation Run: Earnings Impact Over Time
          </CardTitle>
          <CardDescription>
            Upload a transaction file to start each run, then jump through days and weeks to
            see low-score decay and reset risk.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border border-stone-800/70 bg-surface-900/35 p-4 space-y-3">
            <input
              type="file"
              accept=".json,.csv"
              onChange={handleTimelineUpload}
              className="block w-full rounded-lg border border-stone-800 bg-surface-950/60 px-3 py-2 text-sm text-stone-300 file:mr-3 file:rounded-md file:border-0 file:bg-forest-600 file:px-3 file:py-1.5 file:text-white file:font-medium"
            />
            {timelineUploadSummary && (
              <p className="text-xs text-stone-500">{timelineUploadSummary}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={startTimelineRun}
                disabled={isStartingTimelineRun || !timelineUploadTransactions || !wallet}
              >
                {isStartingTimelineRun ? "Starting Run..." : "Start Simulation Run"}
              </Button>
              <Button variant="outline" onClick={resetTimelineRun}>
                <TimerReset className="h-4 w-4" />
                Reset Run
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!timelineRunReady || isAdvancingTimeline}
              onClick={() => advanceTimeline(1)}
            >
              +1 Day
            </Button>
            <Button
              variant="secondary"
              disabled={!timelineRunReady || isAdvancingTimeline}
              onClick={() => advanceTimeline(7)}
            >
              +1 Week
            </Button>
            <Button
              variant="secondary"
              disabled={!timelineRunReady || isAdvancingTimeline}
              onClick={() => advanceTimeline(30)}
            >
              +1 Month
            </Button>
          </div>

          {timelineRunContext && (
            <div className="rounded-lg border border-stone-800 bg-surface-900/35 px-4 py-3 text-sm text-stone-300">
              Run context | Principal: {timelineRunContext.principal.toFixed(6)} SOL | Current
              accrued: {timelineRunContext.currentAccruedYield.toFixed(6)} SOL | Green score:{" "}
              {timelineRunContext.greenScore.toFixed(2)} | Simulated horizon:{" "}
              {timelineHorizonDays} days
            </div>
          )}

          {timelineResult ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-stone-800 bg-surface-900/35 p-3">
                  <p className="text-xs uppercase tracking-wide text-stone-500">
                    Projected Accrued
                  </p>
                  <p className="text-lg font-semibold text-stone-100">
                    {timelineResult.projectedAccruedYield.toFixed(6)} SOL
                  </p>
                </div>
                <div className="rounded-lg border border-stone-800 bg-surface-900/35 p-3">
                  <p className="text-xs uppercase tracking-wide text-stone-500">
                    Baseline Accrued
                  </p>
                  <p className="text-lg font-semibold text-stone-100">
                    {timelineResult.baselineAccruedYield.toFixed(6)} SOL
                  </p>
                </div>
                <div className="rounded-lg border border-stone-800 bg-surface-900/35 p-3">
                  <p className="text-xs uppercase tracking-wide text-stone-500">
                    Earnings Delta
                  </p>
                  <p
                    className={`text-lg font-semibold ${
                      timelineResult.earningsDelta < 0 ? "text-clay-300" : "text-forest-300"
                    }`}
                  >
                    {timelineResult.earningsDelta.toFixed(6)} SOL
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-stone-800 bg-surface-900/35 p-3">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timelinePoints}>
                      <CartesianGrid strokeDasharray="4 4" stroke="#292524" strokeOpacity={0.3} />
                      <XAxis
                        dataKey="day"
                        stroke="#78716c"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#78716c"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value: number) => `${value.toFixed(3)} SOL`}
                      />
                      <Tooltip
                        formatter={(value: number) => `${value.toFixed(6)} SOL`}
                        contentStyle={{
                          backgroundColor: "#1c1917",
                          border: "1px solid #44403c",
                          borderRadius: "0.5rem",
                          color: "#f5f5f4",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="baselineAccruedYield"
                        stroke="#6b9b6b"
                        strokeWidth={2}
                        dot={false}
                        name="Baseline"
                      />
                      <Line
                        type="monotone"
                        dataKey="projectedAccruedYield"
                        stroke="#c65d2b"
                        strokeWidth={2}
                        dot={false}
                        name="Projected (low-score path)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-stone-300">Event Timeline</p>
                {timelineResult.events.length > 0 ? (
                  timelineResult.events.map((event) => (
                    <div
                      key={`${event.type}-${event.day}`}
                      className="rounded-lg border border-stone-800 bg-surface-900/35 px-3 py-2 text-sm"
                    >
                      <span className="text-solar-300 font-medium">Day {event.day}</span>{" "}
                      <span className="text-stone-200">{event.description}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-stone-500">
                    No decay/reset events in this horizon.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-stone-800 bg-surface-900/35 p-4 text-sm text-stone-500">
              Start a simulation run, then click +1 Day / +1 Week / +1 Month to compare
              baseline vs low-score earnings.
            </div>
          )}

          {timelineError && <p className="text-sm text-clay-400">{timelineError}</p>}
          {timelineMessage && <p className="text-sm text-forest-300">{timelineMessage}</p>}
        </CardContent>
      </Card>

      {wallet && showUploadModal && !isHydratingState && (
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
                {hasUploadedTransactions && uploadRefreshRequired
                  ? `Your last upload is older than ${uploadEpochGate.refreshWindowDays} days. Upload a fresh transaction file to keep staking enabled.`
                  : "We need recent uploaded transactions to calculate your green booster before you stake."}
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
