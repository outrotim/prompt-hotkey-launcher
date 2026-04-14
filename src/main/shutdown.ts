type BeforeQuitEvent = {
  preventDefault: () => void;
};

type ShutdownCoordinatorOptions = {
  flushHistory: () => Promise<void>;
  disposeStores: () => void;
  quitApp: () => void;
  onFlushError?: (error: unknown) => void;
};

export function createBeforeQuitHandler(options: ShutdownCoordinatorOptions) {
  let isFinalizingQuit = false;
  let disposed = false;

  return async (event: BeforeQuitEvent) => {
    if (isFinalizingQuit) {
      return;
    }

    isFinalizingQuit = true;
    event.preventDefault();

    try {
      await options.flushHistory();
    } catch (error) {
      options.onFlushError?.(error);
    }

    if (!disposed) {
      options.disposeStores();
      disposed = true;
    }

    options.quitApp();
  };
}
