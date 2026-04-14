import { watch } from "node:fs";
import { resolve } from "node:path";
import type { PromptLibrary } from "../shared/types";

type PromptLibraryLoader = (
  promptsDirectory: string
) => PromptLibrary | Promise<PromptLibrary>;
type PromptLibraryWatcher = {
  close: () => void;
};

export type PromptLibraryStore = {
  getLibrary: () => Promise<PromptLibrary>;
  invalidate: () => void;
  dispose: () => void;
};

export function createPromptLibraryStore(
  promptsDirectory: string,
  options: {
    loadPromptLibrary: PromptLibraryLoader;
    watchPromptsDirectory?: (
      promptsDirectory: string,
      invalidate: () => void
    ) => PromptLibraryWatcher;
  }
): PromptLibraryStore {
  const directory = resolve(promptsDirectory);
  const loadLibrary = options.loadPromptLibrary;
  let cachedLibrary: PromptLibrary | null = null;
  let pendingLibraryPromise: Promise<PromptLibrary> | null = null;
  let generation = 0;
  const invalidate = () => {
    generation += 1;
    cachedLibrary = null;
    pendingLibraryPromise = null;
  };
  const watcher = (options.watchPromptsDirectory ?? watchPromptsDirectory)(
    directory,
    invalidate
  );

  return {
    async getLibrary() {
      if (cachedLibrary) {
        return cachedLibrary;
      }

      if (pendingLibraryPromise) {
        return pendingLibraryPromise;
      }

      const loadGeneration = generation;
      const nextPromise = Promise.resolve(loadLibrary(directory)).then(
        (nextLibrary) => {
          if (loadGeneration === generation) {
            cachedLibrary = nextLibrary;
          }

          if (pendingLibraryPromise === nextPromise) {
            pendingLibraryPromise = null;
          }

          return nextLibrary;
        },
        (error) => {
          if (pendingLibraryPromise === nextPromise) {
            pendingLibraryPromise = null;
          }

          throw error;
        }
      );
      pendingLibraryPromise = nextPromise;

      return pendingLibraryPromise;
    },
    invalidate,
    dispose() {
      watcher.close();
      invalidate();
    }
  };
}

function watchPromptsDirectory(
  promptsDirectory: string,
  invalidate: () => void
): PromptLibraryWatcher {
  const watcher = watch(
    promptsDirectory,
    { recursive: true },
    (_eventType, fileName) => {
      if (
        !fileName ||
        fileName.toLowerCase().endsWith(".md") ||
        fileName.endsWith("_pack.yaml") ||
        fileName.endsWith("_pack.yml")
      ) {
        invalidate();
      }
    }
  );

  return {
    close: () => {
      watcher.close();
    }
  };
}
