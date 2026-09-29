/**
 * Loads a module on first use and caches it. A failed load (e.g. offline before the service
 * worker has cached the chunk) is not cached, so the next call retries.
 */
export function lazy<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () =>
    (pending ??= load().catch((e: unknown) => {
      pending = null;
      throw e;
    }));
}
