const inflightKeys = new Set<string>();

export async function withExclusiveAction<T>(
  key: string,
  busyResult: T,
  action: () => Promise<T>,
): Promise<T> {
  if (inflightKeys.has(key)) {
    return busyResult;
  }

  inflightKeys.add(key);
  try {
    return await action();
  } finally {
    inflightKeys.delete(key);
  }
}
