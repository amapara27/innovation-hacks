import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Link } from "react-router-dom";
import { Coins, Database, Globe, Landmark, TreePine, TrendingUp, Zap } from "lucide-react";
import GreenScoreDisplay from "@/components/dashboard/GreenScoreDisplay";
import CarbonFootprintChart from "@/components/dashboard/CarbonFootprintChart";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { useWalletState } from "@/hooks/useWalletState";
import {
  formatError,
  formatKg,
  requestJson,
  type AnalyzeResponse,
  type GreenScoreData,
  type StakingInfoResponse,
} from "@/lib/api";
import { parseUploadFile, type DemoMode, type DemoTransactionInput } from "@/lib/demoBank";
import { markUploadCompleted, uploadEpochGate, isUploadRefreshRequiredForTimestamp } from "@/lib/uploadEpochGate";

interface DemoConnectBankResponse {
  wallet: string;
  mode: DemoMode;
  sourceLabel: string;
  transactionCount: number;
  connectedAt: string;
}

export default function Dashboard() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const {
    data: walletState,
    isLoading: isHydratingState,
    error: walletStateError,
    refetch: refetchWalletState,
  } = useWalletState(wallet);

  const [uploadedTransactions, setUploadedTransactions] =
    useState<DemoTransactionInput[] | null>(null);
  const [uploadSummary, setUploadSummary] = useState("");
  const [bankConnectResult, setBankConnectResult] =
    useState<DemoConnectBankResponse | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(null);
  const [greenScore, setGreenScore] = useState<GreenScoreData | null>(null);
  const [stakingInfo, setStakingInfo] = useState<StakingInfoResponse | null>(null);
  const [isConnectingBank, setIsConnectingBank] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const latestRecommendations = walletState?.latestRecommendations ?? null;

  useEffect(() => {
    setAnalysisResult(walletState?.analysis ?? null);
    setGreenScore(walletState?.greenScore ?? null);
    setStakingInfo(walletState?.stakingInfo ?? null);
  }, [walletState]);

  useEffect(() => {
    if (!wallet) {
      setUploadedTransactions(null);
      setUploadSummary("");
      setBankConnectResult(null);
      setAnalysisResult(null);
      setGreenScore(null);
      setStakingInfo(null);
      setMessage("");
      setError("");
    }
  }, [wallet]);

  const uploadRefreshRequired = useMemo(
    () => isUploadRefreshRequiredForTimestamp(walletState?.latestUploadAt),
    [walletState?.latestUploadAt]
  );

  const hasUploadedTransactions = walletState?.hasUploadedTransactions ?? false;
  const hasStakePosition = (stakingInfo?.stakedAmount ?? 0) > 0;
  const dashboardLocked =
    Boolean(wallet) &&
    !isHydratingState &&
    (!hasUploadedTransactions || uploadRefreshRequired);
  const stakingMultiplier =
    stakingInfo && stakingInfo.baseApy > 0
      ? stakingInfo.effectiveApy / stakingInfo.baseApy
      : null;
  const potentialMonthlyCostSavings = useMemo(
    () =>
      latestRecommendations?.suggestions.reduce(
        (sum, suggestion) => sum + Math.max(0, -suggestion.priceDifferenceUsd),
        0
      ) ?? 0,
    [latestRecommendations]
  );

  const tickerStats = [
    {
      label: "Total CO₂ Emissions",
      value: analysisResult ? formatKg(analysisResult.totalCo2eGrams) : "—",
      icon: TreePine,
      change: analysisResult ? "From uploaded transactions" : "Upload transactions to load data",
    },
    {
      label: "Transactions Analyzed",
      value: `${analysisResult?.transactionCount ?? 0}`,
      icon: Zap,
      change: analysisResult ? "Stored in Mongo and restored on reload" : "Awaiting upload",
    },
    {
      label: "Global Rank",
      value: `#${greenScore?.rank ?? "—"}`,
      icon: Globe,
      change: greenScore?.totalUsers
        ? `of ${greenScore.totalUsers} users`
        : "Refresh performance to update",
    },
    {
      label: "Effective Staking APY",
      value: stakingInfo ? `${stakingInfo.effectiveApy.toFixed(2)}%` : "—",
      icon: TrendingUp,
      change: "Based on your latest green score",
      accentChange:
        stakingInfo && stakingMultiplier
          ? `Booster +${stakingInfo.greenBonus.toFixed(2)}% (${stakingMultiplier.toFixed(2)}x)`
          : null,
    },
  ];

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = await parseUploadFile(file);
      setUploadedTransactions(parsed);
      setUploadSummary(`Loaded ${parsed.length} transactions from ${file.name}`);
      setError("");
    } catch (uploadError) {
      setUploadedTransactions(null);
      setUploadSummary(formatError(uploadError));
    } finally {
      event.target.value = "";
    }
  }

  async function handleConnectBank() {
    if (!wallet) {
      setError("Connect your wallet first.");
      return;
    }

    if (!uploadedTransactions) {
      setError("Upload a JSON or CSV file before continuing.");
      return;
    }

    setError("");
    setMessage("");
    setIsConnectingBank(true);

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

      setBankConnectResult(response);
      markUploadCompleted(wallet, response.connectedAt);
      await refetchWalletState();
      setMessage(`Uploaded ${response.transactionCount} transactions from ${response.sourceLabel}.`);
    } catch (connectError) {
      setError(formatError(connectError));
    } finally {
      setIsConnectingBank(false);
    }
  }

  async function handleAnalyzeTransactions() {
    if (!wallet) {
      setError("Connect your wallet first.");
      return;
    }

    setError("");
    setMessage("");
    setIsAnalyzing(true);

    try {
      const response = await requestJson<AnalyzeResponse>("/api/analyze-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, limit: 20 }),
      });

      setAnalysisResult(response);
      setMessage(`Refreshed ${response.transactionCount} analyzed transactions.`);
    } catch (analysisError) {
      setError(formatError(analysisError));
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleRefreshScore() {
    if (!wallet) {
      setError("Connect your wallet first.");
      return;
    }

    setError("");
    setMessage("");
    setIsRefreshing(true);

    try {
      const [scoreResponse, stakeInfo] = await Promise.all([
        requestJson<GreenScoreData>(`/api/green-score?wallet=${encodeURIComponent(wallet)}`),
        requestJson<StakingInfoResponse>(
          `/api/staking-info?wallet=${encodeURIComponent(wallet)}`
        ),
      ]);

      setGreenScore(scoreResponse);
      setStakingInfo(stakeInfo);
      await refetchWalletState();
      setMessage("Performance metrics refreshed.");
    } catch (refreshError) {
      setError(formatError(refreshError));
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-display font-bold tracking-tight text-stone-50">
          Dashboard
        </h1>
        <p className="text-stone-400 text-base tracking-wide">
          Your uploads, analysis, score, and staking state now hydrate automatically.
        </p>
      </div>

      {!wallet && (
        <Card>
          <CardHeader>
            <CardTitle>Connect Wallet to Continue</CardTitle>
            <CardDescription>
              Connect your wallet from the sidebar to load your dashboard.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {wallet && isHydratingState && (
        <Card>
          <CardHeader>
            <CardTitle>Loading Uploaded Transactions</CardTitle>
            <CardDescription>
              Restoring your latest analysis, score, and staking state from Mongo.
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

      {wallet && !isHydratingState && dashboardLocked && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Transactions Before Dashboard Access</CardTitle>
            <CardDescription>
              {!hasUploadedTransactions
                ? "No uploaded transactions were found for this wallet. Add a transaction file to unlock your dashboard."
                : `Your last upload is older than ${uploadEpochGate.refreshWindowDays} days. Upload a fresh file to keep your dashboard current.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <input
                type="file"
                accept=".json,.csv"
                onChange={handleUpload}
                className="block w-full text-sm text-stone-300 file:mr-4 file:rounded-md file:border-0 file:bg-forest-600 file:px-3 file:py-2 file:text-white"
              />
              {uploadSummary && <p className="text-xs text-stone-500">{uploadSummary}</p>}
            </div>
            <Button
              onClick={handleConnectBank}
              disabled={isConnectingBank || !uploadedTransactions}
            >
              {isConnectingBank ? "Uploading..." : "Upload Transactions + Unlock"}
            </Button>
            {error && <p className="text-sm text-clay-400">{error}</p>}
            {message && <p className="text-sm text-forest-300">{message}</p>}
          </CardContent>
        </Card>
      )}

      {wallet && !isHydratingState && !dashboardLocked && (
        <>
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="lg:w-[45.83%]">
              <GreenScoreDisplay
                score={greenScore?.score ?? 0}
                extraContent={
                  <>
                    <div className="p-4 rounded-lg bg-surface-900/40 border border-stone-800/60">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-forest-600/20 to-earth-600/15 border border-forest-600/20 flex-shrink-0">
                          <Landmark className="h-4 w-4 text-forest-400" strokeWidth={2.2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                            Amount Staked
                          </p>
                          <p className="text-2xl font-display font-bold text-stone-100 tracking-tight">
                            {stakingInfo ? `${stakingInfo.stakedAmount.toFixed(4)} SOL` : "—"}
                          </p>
                          <p className="text-xs text-stone-500">
                            {hasStakePosition ? "Current principal in stake vault" : "No active stake yet"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-surface-900/40 border border-stone-800/60">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-forest-600/20 to-earth-600/15 border border-forest-600/20 flex-shrink-0">
                          <Coins className="h-4 w-4 text-forest-400" strokeWidth={2.2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                            Amount Accrued So Far
                          </p>
                          <p className="text-2xl font-display font-bold text-stone-100 tracking-tight">
                            {stakingInfo ? `${stakingInfo.accruedYield.toFixed(6)} SOL` : "—"}
                          </p>
                          <p className="text-xs text-stone-500">
                            {hasStakePosition ? "Yield earned to date" : "Stake to start accruing rewards"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <Button asChild size="lg" className="w-full">
                      <Link to="/staking">Stake More</Link>
                    </Button>
                  </>
                }
              />
            </div>

            <div className="lg:w-[54.17%] flex flex-col gap-3">
              {tickerStats.map((stat) => (
                <div
                  key={stat.label}
                  className="card-organic p-4 flex items-center gap-4 hover:scale-[1.01] transition-transform duration-300"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-forest-600/20 to-earth-600/15 border border-forest-600/20 flex-shrink-0">
                    <stat.icon className="h-4 w-4 text-forest-400" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                      {stat.label}
                    </p>
                    <p className="text-2xl font-display font-bold text-stone-100 tracking-tight">
                      {stat.value}
                    </p>
                    <p className="text-xs text-stone-500">
                      {stat.change}
                      {"accentChange" in stat && stat.accentChange ? (
                        <span className="ml-1.5 font-semibold text-solar-400">
                          {stat.accentChange}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
              ))}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-forest-400" />
                    Upload Transactions + Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-xl border border-stone-800/70 bg-surface-900/35 p-3 space-y-2">
                    <input
                      type="file"
                      accept=".json,.csv"
                      onChange={handleUpload}
                      className="block w-full rounded-lg border border-stone-800 bg-surface-950/60 px-3 py-2 text-sm text-stone-300 file:mr-3 file:rounded-md file:border-0 file:bg-forest-600 file:px-3 file:py-1.5 file:text-white file:font-medium"
                    />
                    {uploadSummary && (
                      <p className="text-xs text-stone-500 leading-relaxed">{uploadSummary}</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-stone-800/70 bg-surface-900/35 p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Button
                        size="sm"
                        onClick={handleConnectBank}
                        disabled={isConnectingBank || !uploadedTransactions}
                        className="w-full"
                      >
                        {isConnectingBank ? "Uploading..." : "Upload Transactions"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleAnalyzeTransactions}
                        disabled={isAnalyzing}
                        className="w-full"
                      >
                        {isAnalyzing ? "Refreshing..." : "Refresh Analysis"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleRefreshScore}
                        disabled={isRefreshing}
                        className="w-full"
                      >
                        {isRefreshing ? "Refreshing..." : "Refresh Performance"}
                      </Button>
                    </div>
                  </div>

                  {walletState?.latestUploadAt && (
                    <div className="rounded-lg border border-stone-800 bg-surface-900/35 px-3 py-2">
                      <p className="text-xs text-stone-400">
                        Latest upload: {new Date(walletState.latestUploadAt).toLocaleString()}
                      </p>
                    </div>
                  )}

                  {bankConnectResult && (
                    <div className="rounded-lg border border-forest-700/30 bg-forest-700/10 px-3 py-2">
                      <p className="text-xs text-forest-300">
                        Uploaded source: {bankConnectResult.sourceLabel} ({bankConnectResult.transactionCount} transactions)
                      </p>
                    </div>
                  )}

                  {error && (
                    <div className="rounded-lg border border-clay-700/35 bg-clay-700/10 px-3 py-2">
                      <p className="text-xs text-clay-300">{error}</p>
                    </div>
                  )}
                  {message && (
                    <div className="rounded-lg border border-forest-700/30 bg-forest-700/10 px-3 py-2">
                      <p className="text-xs text-forest-300">{message}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div>
            <CarbonFootprintChart />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Swap Potential Snapshot</CardTitle>
              <CardDescription>
                Latest saved product alternatives from your uploaded spending profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-stone-800/70 bg-surface-900/35 p-4">
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                  Potential CO₂ Reduction
                </p>
                <p className="mt-2 text-2xl font-display font-bold text-forest-300 tracking-tight">
                  {latestRecommendations
                    ? `${formatKg(latestRecommendations.totalPotentialSavingsMonthly)}/month`
                    : "—"}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  {latestRecommendations
                    ? `${latestRecommendations.suggestions.length} saved swap suggestions ready to review`
                    : "Generate product swaps to surface savings here."}
                </p>
              </div>

              <div className="rounded-xl border border-stone-800/70 bg-surface-900/35 p-4">
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                  Estimated Monthly Savings
                </p>
                <p className="mt-2 text-2xl font-display font-bold text-solar-400 tracking-tight">
                  {latestRecommendations ? `$${potentialMonthlyCostSavings.toFixed(2)}` : "—"}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  Sum of the cheaper saved alternatives in your latest recommendation set.
                </p>
              </div>
            </CardContent>
          </Card>

          {analysisResult && (
            <Card>
              <CardHeader>
                <CardTitle>Uploaded Transactions</CardTitle>
                <CardDescription>
                  Scroll the ledger here without letting the upload view take over the whole dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-stone-800/70 bg-surface-950/50">
                  <div className="grid grid-cols-2 gap-3 border-b border-stone-800/70 px-4 py-3 text-xs uppercase tracking-[0.2em] text-stone-500">
                    <div>{analysisResult.transactionCount} transactions</div>
                    <div className="text-right">{formatKg(analysisResult.totalCo2eGrams)} total</div>
                  </div>
                  <div className="max-h-[26rem] overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="sticky top-0 text-left text-stone-400 border-b border-stone-800 bg-surface-950/95 backdrop-blur">
                          <th className="px-4 py-3 pr-3">Description</th>
                          <th className="px-4 py-3 pr-3">Amount</th>
                          <th className="px-4 py-3 pr-3">Category</th>
                          <th className="px-4 py-3 pr-3">CO₂e (kg)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysisResult.transactions.map((transaction) => (
                          <tr
                            key={transaction.transactionId}
                            className="border-b border-stone-900 text-stone-300 hover:bg-surface-900/35"
                          >
                            <td className="px-4 py-3 pr-3">{transaction.description}</td>
                            <td className="px-4 py-3 pr-3">${transaction.amountUsd.toFixed(2)}</td>
                            <td className="px-4 py-3 pr-3">{transaction.category}</td>
                            <td className="px-4 py-3 pr-3">{formatKg(transaction.co2eGrams, 3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
