const UPLOAD_REFRESH_WINDOW_DAYS = 4;
const UPLOAD_REFRESH_WINDOW_MS = UPLOAD_REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function getStorageKey(wallet: string): string {
  return `carboniq:last-upload-at:${wallet}`;
}

export function getLastUploadTimestamp(wallet: string | null): number | null {
  if (!wallet || typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(getStorageKey(wallet));
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function isUploadRefreshRequired(wallet: string | null): boolean {
  const lastUploadTimestamp = getLastUploadTimestamp(wallet);
  if (lastUploadTimestamp === null) {
    return true;
  }

  return Date.now() - lastUploadTimestamp >= UPLOAD_REFRESH_WINDOW_MS;
}

export function markUploadCompleted(wallet: string, connectedAt?: string): void {
  if (!wallet || typeof window === "undefined") {
    return;
  }

  const parsedTimestamp = connectedAt ? Date.parse(connectedAt) : NaN;
  const timestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();
  window.localStorage.setItem(getStorageKey(wallet), String(timestamp));
}

export const uploadEpochGate = {
  refreshWindowDays: UPLOAD_REFRESH_WINDOW_DAYS,
};
