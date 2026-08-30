export function calculateElapsedSeconds(
  baseElapsedSec: number,
  startedAtMs: number | null,
  nowMs: number,
): number {
  const safeBase = Math.max(0, baseElapsedSec);
  if (startedAtMs === null) return safeBase;
  return safeBase + Math.max(0, nowMs - startedAtMs) / 1000;
}

