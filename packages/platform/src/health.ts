export type HealthStatus = 'ok' | 'degraded' | 'down';

export type HealthReport = {
  status: HealthStatus;
  service: string;
  timestamp: string;
  checks: Record<string, 'ok' | 'error'>;
};

export function createHealthReport(service: string, checks: Record<string, 'ok' | 'error'>): HealthReport {
  const status: HealthStatus = Object.values(checks).every((value) => value === 'ok') ? 'ok' : 'degraded';

  return {
    status,
    service,
    timestamp: new Date().toISOString(),
    checks,
  };
}
