import { useCallback, useEffect, useMemo, useState } from "react";
import { requestJson, type WalletStateResponse } from "@/lib/api";

export function useWalletState(wallet: string | null) {
  const [data, setData] = useState<WalletStateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!wallet) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await requestJson<WalletStateResponse>(
        `/api/wallet-state?wallet=${encodeURIComponent(wallet)}`
      );
      setData(response);
      return response;
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load wallet state.");
      setData(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return useMemo(
    () => ({ data, isLoading, error, refetch, setData }),
    [data, isLoading, error, refetch]
  );
}
