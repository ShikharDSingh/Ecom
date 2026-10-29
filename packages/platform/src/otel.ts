import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

export function initializeTelemetry(serviceName: string, version = '0.1.0') {
  const enabled = process.env.OTEL_ENABLED === 'true';

  if (!enabled) {
    return undefined;
  }

  const sdk = new NodeSDK({
    serviceName,
    instrumentations: [getNodeAutoInstrumentations()],
    resourceDetectors: [],
    resource: undefined,
  });

  sdk.start();
  return sdk;
}

export async function shutdownTelemetry(sdk?: { shutdown: () => Promise<void> | void }) {
  if (!sdk) {
    return;
  }

  await sdk.shutdown();
}
