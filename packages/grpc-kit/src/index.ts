export type GrpcCallConfig = {
  deadlineMs?: number;
  retryable?: boolean;
};

export function normalizeGrpcDeadline(deadlineMs?: number, defaultMs = 2000): number {
  return Math.max(1, deadlineMs ?? defaultMs);
}
