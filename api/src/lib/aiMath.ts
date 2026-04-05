export function roundTo(value: number, places = 2): number {
  return Number(value.toFixed(places));
}

export function clampNumber(
  value: number,
  minimum: number,
  maximum: number
): number {
  return Math.max(minimum, Math.min(maximum, value));
}
