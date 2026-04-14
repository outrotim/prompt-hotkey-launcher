type ManagedStore = {
  name: string;
  dispose: () => void;
  flush?: () => Promise<void>;
};

type StoreLifecycleManagerOptions = {
  flushTimeoutMs?: number;
  onFlushTimeout?: (store: ManagedStore) => void;
  onFlushError?: (error: unknown, store: ManagedStore) => void;
};

export type StoreLifecycleManager = {
  flushAll: () => Promise<void>;
  disposeAll: () => void;
};

export function createStoreLifecycleManager(
  stores: ManagedStore[],
  options?: StoreLifecycleManagerOptions
): StoreLifecycleManager {
  let disposed = false;
  const flushTimeoutMs = options?.flushTimeoutMs ?? 2000;

  return {
    async flushAll() {
      for (const store of stores) {
        if (store.flush) {
          try {
            await waitForFlush(store, flushTimeoutMs, options);
          } catch (error) {
            options?.onFlushError?.(error, store);
          }
        }
      }
    },
    disposeAll() {
      if (disposed) {
        return;
      }

      disposed = true;

      for (const store of stores) {
        store.dispose();
      }
    }
  };
}

async function waitForFlush(
  store: ManagedStore,
  flushTimeoutMs: number,
  options?: StoreLifecycleManagerOptions
) {
  if (!store.flush) {
    return;
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    await Promise.race([
      store.flush(),
      new Promise<void>((resolve) => {
        timeoutId = setTimeout(() => {
          options?.onFlushTimeout?.(store);
          resolve();
        }, flushTimeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
