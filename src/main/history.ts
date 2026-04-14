import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, watch, writeFileSync } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { PromptItem, PromptUsageRecord } from "../shared/types";

type HistoryWatcher = {
  close: () => void;
};

type HistoryAsyncFileSystem = {
  mkdir: (path: string, options: { recursive: true }) => Promise<unknown>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  unlink: (path: string) => Promise<void>;
  writeFile: (path: string, data: string) => Promise<void>;
};

type HistoryFileSystem = {
  existsSync: typeof existsSync;
  mkdirSync: typeof mkdirSync;
  readFileSync: typeof readFileSync;
  renameSync: typeof renameSync;
  unlinkSync: typeof unlinkSync;
  writeFileSync: typeof writeFileSync;
};

type HistoryAsyncDependencies = {
  mkdir?: typeof mkdir;
  rename?: typeof rename;
  unlink?: typeof unlink;
  writeFile?: typeof writeFile;
};

export type HistoryStore = {
  annotatePrompts: (items: PromptItem[]) => PromptItem[];
  recordUsage: (record: PromptUsageRecord) => void;
  flush: () => Promise<void>;
  invalidate: () => void;
  dispose: () => void;
};

export function createHistoryStore(filePath: string): HistoryStore {
  const fileSystem: HistoryFileSystem = {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    unlinkSync,
    writeFileSync
  };
  return createHistoryStoreWithFileSystem(filePath, fileSystem, {
    asyncFileSystem: createDefaultHistoryAsyncFileSystem(fileSystem),
    watchHistoryFile: (nextFilePath, invalidate) => {
      const targetFileName = basename(nextFilePath);
      const watcher = watch(dirname(nextFilePath), (_eventType, changedFileName) => {
        if (!changedFileName || changedFileName === targetFileName) {
          invalidate();
        }
      });

      return {
        close: () => {
          watcher.close();
        }
      };
    }
  });
}

export function createHistoryStoreWithFileSystem(
  filePath: string,
  fileSystem: HistoryFileSystem,
  options?: {
    asyncFileSystem?: HistoryAsyncFileSystem;
    watchHistoryFile?: (
      filePath: string,
      invalidate: () => void
    ) => HistoryWatcher;
  }
): HistoryStore {
  let cachedRecords: PromptUsageRecord[] | null = null;
  let pendingWritePromise = Promise.resolve();
  let writeGeneration = 0;
  const asyncFileSystem =
    options?.asyncFileSystem ?? createDefaultHistoryAsyncFileSystem(fileSystem);

  const invalidate = () => {
    writeGeneration += 1;
    cachedRecords = null;
  };

  const watcher = options?.watchHistoryFile?.(filePath, invalidate) ?? null;

  const readRecords = () => {
    if (cachedRecords) {
      return cachedRecords;
    }

    if (!fileSystem.existsSync(filePath)) {
      cachedRecords = [];
      return cachedRecords;
    }

    try {
      const raw = fileSystem.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as PromptUsageRecord[];
      cachedRecords = Array.isArray(parsed) ? parsed : [];
      return cachedRecords;
    } catch {
      cachedRecords = [];
      return cachedRecords;
    }
  };

  const writeRecords = (records: PromptUsageRecord[]) => {
    cachedRecords = records;
    const serialized = JSON.stringify(records, null, 2);
    const nextGeneration = writeGeneration + 1;
    writeGeneration = nextGeneration;

    pendingWritePromise = pendingWritePromise
      .catch(() => {})
      .then(async () => {
        const tempFilePath = `${filePath}.tmp`;

        if (nextGeneration !== writeGeneration) {
          return;
        }

        await asyncFileSystem.mkdir(dirname(filePath), { recursive: true });

        if (nextGeneration !== writeGeneration) {
          return;
        }

        await asyncFileSystem.writeFile(tempFilePath, serialized);

        if (nextGeneration !== writeGeneration) {
          await asyncFileSystem.unlink(tempFilePath).catch(() => {});
          return;
        }

        await asyncFileSystem.rename(tempFilePath, filePath);
      });

    pendingWritePromise.catch((error) => {
      console.error("[history] Failed to write history file:", error);
    });
  };

  return {
    annotatePrompts: (items) => {
      const records = readRecords();
      const usageByPromptId = new Map<
        string,
        {
          useCount: number;
          lastUsedAt?: string;
          lastValues: Record<string, string>;
        }
      >();

      for (const record of records) {
        const current = usageByPromptId.get(record.promptId);

        if (!current) {
          usageByPromptId.set(record.promptId, {
            useCount: 1,
            lastUsedAt: record.usedAt,
            lastValues: record.values
          });
          continue;
        }

        current.useCount += 1;

        if (!current.lastUsedAt || record.usedAt > current.lastUsedAt) {
          current.lastUsedAt = record.usedAt;
          current.lastValues = record.values;
        }
      }

      return items.map((item) => {
        const usage = usageByPromptId.get(item.id);

        return {
          ...item,
          useCount: usage?.useCount ?? 0,
          lastUsedAt: usage?.lastUsedAt,
          lastValues: usage?.lastValues ?? {}
        };
      });
    },
    recordUsage: (record) => {
      const records = readRecords();
      const nextRecords = [record, ...records].slice(0, 200);
      writeRecords(nextRecords);
    },
    flush: () => pendingWritePromise,
    invalidate,
    dispose: () => {
      watcher?.close();
      invalidate();
    }
  };
}

export function createDefaultHistoryAsyncFileSystem(
  fileSystem: HistoryFileSystem,
  dependencies: HistoryAsyncDependencies = {}
): HistoryAsyncFileSystem {
  const mkdirDependency = dependencies.mkdir ?? mkdir;
  const renameDependency = dependencies.rename ?? rename;
  const unlinkDependency = dependencies.unlink ?? unlink;
  const writeFileDependency = dependencies.writeFile ?? writeFile;

  return {
    mkdir: async (path: string, options: { recursive: true }) => {
      if (dependencies.mkdir) {
        await mkdirDependency(path, options);
        return;
      }

      fileSystem.mkdirSync(path, options);
    },
    rename: async (oldPath: string, newPath: string) => {
      if (dependencies.rename) {
        await renameDependency(oldPath, newPath);
        return;
      }

      fileSystem.renameSync(oldPath, newPath);
    },
    unlink: async (path: string) => {
      try {
        if (dependencies.unlink) {
          await unlinkDependency(path);
          return;
        }

        fileSystem.unlinkSync(path);
      } catch {}
    },
    writeFile: async (path: string, data: string) => {
      if (dependencies.writeFile) {
        await writeFileDependency(path, data);
        return;
      }

      fileSystem.writeFileSync(path, data);
    }
  };
}
