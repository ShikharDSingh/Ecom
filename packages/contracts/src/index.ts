export const STOCKFLOW_PROTO_VERSION = '0.1.0';

export type MessageLike = {
  toJSON?: () => Record<string, unknown>;
};

export function messageSummary(message: MessageLike | undefined): Record<string, unknown> | undefined {
  return message?.toJSON ? message.toJSON() : undefined;
}

