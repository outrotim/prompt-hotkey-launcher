import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type AppSettings = {
  hotkey: string;
  launchAtLogin: boolean;
  locale: "en" | "zh-CN";
  packOrder: string[];
  promptOrder: string[];
  customPromptsDirectory: string;
  settingsSectionOrder: string[];
};

export const DEFAULT_SETTINGS: AppSettings = {
  hotkey: "Control+Q",
  launchAtLogin: false,
  locale: "en",
  packOrder: [],
  promptOrder: [],
  customPromptsDirectory: "",
  settingsSectionOrder: []
};

type SettingsWatcher = {
  close: () => void;
};

type SettingsFileSystem = {
  existsSync: typeof existsSync;
  mkdirSync: typeof mkdirSync;
  readFileSync: typeof readFileSync;
  renameSync: typeof renameSync;
  unlinkSync: typeof unlinkSync;
  writeFileSync: typeof writeFileSync;
};

export type SettingsStore = {
  getSettings: () => AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => AppSettings;
  invalidate: () => void;
  dispose: () => void;
};

export function createSettingsStore(filePath: string): SettingsStore {
  const fileSystem: SettingsFileSystem = {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    unlinkSync,
    writeFileSync
  };

  return createSettingsStoreWithFileSystem(filePath, fileSystem);
}

export function createSettingsStoreWithFileSystem(
  filePath: string,
  fileSystem: SettingsFileSystem,
  options?: {
    watchSettingsFile?: (
      filePath: string,
      invalidate: () => void
    ) => SettingsWatcher;
  }
): SettingsStore {
  let cachedSettings: AppSettings | null = null;

  const invalidate = () => {
    cachedSettings = null;
  };

  const watcher = options?.watchSettingsFile?.(filePath, invalidate) ?? null;

  const readSettings = (): AppSettings => {
    if (cachedSettings) {
      return cachedSettings;
    }

    if (!fileSystem.existsSync(filePath)) {
      cachedSettings = DEFAULT_SETTINGS;
      return cachedSettings;
    }

    try {
      const raw = fileSystem.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      cachedSettings = {
        ...DEFAULT_SETTINGS,
        ...parsed
      };
      return cachedSettings;
    } catch (error) {
      console.warn(`[settings] Failed to parse ${filePath}, falling back to defaults:`, error);
      cachedSettings = DEFAULT_SETTINGS;
      return cachedSettings;
    }
  };

  const writeSettings = (settings: AppSettings) => {
    fileSystem.mkdirSync(dirname(filePath), { recursive: true });
    const tempFilePath = `${filePath}.tmp`;

    try {
      fileSystem.writeFileSync(tempFilePath, JSON.stringify(settings, null, 2));
      fileSystem.renameSync(tempFilePath, filePath);
    } catch (error) {
      try {
        fileSystem.unlinkSync(tempFilePath);
      } catch {
        // Temp file doesn't exist or already deleted
      }

      throw error;
    }

    cachedSettings = settings;
  };

  return {
    getSettings: () => readSettings(),
    updateSettings: (partial: Partial<AppSettings>) => {
      const nextSettings = {
        ...readSettings(),
        ...partial
      };

      writeSettings(nextSettings);
      return nextSettings;
    },
    invalidate,
    dispose: () => {
      watcher?.close();
      invalidate();
    }
  };
}
