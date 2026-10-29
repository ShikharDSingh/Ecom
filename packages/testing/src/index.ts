export function expectContractShape<T>(value: T, matcher: Partial<T>): T {
  for (const [key, expectedValue] of Object.entries(matcher)) {
    if (value?.[key as keyof T] !== expectedValue) {
      throw new Error(`Contract mismatch for ${String(key)}`);
    }
  }

  return value;
}
