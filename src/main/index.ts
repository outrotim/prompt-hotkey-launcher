import { Notification, app, clipboard, dialog, ipcMain, powerMonitor, shell } from "electron";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadPromptLibraryAsync } from "../core/parser";
import { renderPromptBody } from "../core/template";
import { createHistoryStore } from "./history";
import { pasteText } from "./paste";
import { openPathOrThrow } from "./open-path";
import { createPlatformRuntimeAdapter } from "./platform-runtime";
import { createPromptLibraryStore } from "./prompt-library-store";
import { resolvePromptsDirectory } from "./prompt-directory";
import { assertPromptFilePath } from "./prompt-path";
import { getAccessibilityStatus, promptForAccessibilityAccess } from "./permissions";
import { quickAddPrompt, savePromptFile } from "./prompt-store";
import { executePromptSelection } from "./prompt-selection";
import { readSafePopupWindowState } from "./popup-window-state";
import { createSettingsStore } from "./settings";
import { createSettingsUpdatePlan } from "./settings-update";
import { runPlatformShellCommand } from "./shell-command.js";
import { createBeforeQuitHandler } from "./shutdown";
import { createStoreLifecycleManager } from "./store-lifecycle";
import { createShortcutManager, DEFAULT_HOTKEY } from "./shortcut";
import { createTrayManager } from "./tray";
import {
  createManagerWindow,
  createPopupWindow,
  createSettingsWindow,
  hidePopupWindow,
  showPopupWindow
} from "./window";

function bootstrap() {
  let managerWindow: ReturnType<typeof createManagerWindow> | null = null;
  let settingsWindow: ReturnType<typeof createSettingsWindow> | null = null;
  const appDataDirectory = join(app.getPath("userData"), "data");
  const platformRuntime = createPlatformRuntimeAdapter({
    app,
    getAccessibilityStatus,
    promptForAccessibilityAccess,
    getManagerWindow: () => managerWindow,
    getSettingsWindow: () => settingsWindow
  });
  platformRuntime.applyActivationPolicy();
  let popupWindow = createPopupWindow();
  mkdirSync(appDataDirectory, { recursive: true });
  const settingsStore = createSettingsStore(
    join(appDataDirectory, "settings.json")
  );
  let promptsDirectory = resolvePromptsDirectory(settingsStore.getSettings().customPromptsDirectory);
  let promptLibraryStore = createPromptLibraryStore(promptsDirectory, {
    loadPromptLibrary: loadPromptLibraryAsync
  });
  const historyStore = createHistoryStore(
    join(appDataDirectory, "history.json")
  );
  const storeLifecycle = createStoreLifecycleManager([
    {
      name: "settings",
      ...settingsStore
    },
    {
      name: "history",
      ...historyStore
    },
    {
      name: "promptLibrary",
      dispose: () => { promptLibraryStore.dispose(); }
    }
  ], {
    flushTimeoutMs: 1500,
    onFlushTimeout: (store) => {
      console.warn(`Store flush timed out before quit (${store.name}).`);
    },
    onFlushError: (error, store) => {
      console.error(`Store flush failed before quit (${store.name}).`, error);
    }
  });
  const handleBeforeQuit = createBeforeQuitHandler({
    flushHistory: () => storeLifecycle.flushAll(),
    disposeStores: () => storeLifecycle.disposeAll(),
    quitApp: () => app.quit(),
    onFlushError: () => {}
  });
  const logPopupToggleState = (
    phase: "toggle-before" | "toggle-after",
    targetWindow: ReturnType<typeof createPopupWindow>
  ) => {
    const state = readSafePopupWindowState(targetWindow);
    console.info(
      `[popup-toggle:${phase}] visible=${state.visible} focused=${state.focused} destroyed=${state.destroyed}`
    );
  };
  const togglePopup = () => {
    logPopupToggleState("toggle-before", popupWindow);

    if (popupWindow.isDestroyed()) {
      popupWindow = createPopupWindow();
      void platformRuntime.captureFocusTargetBeforePromptDisplay();
      showPopupWindow(popupWindow);
      popupWindow.webContents.send("popup:opened");
      logPopupToggleState("toggle-after", popupWindow);
      return;
    }

    if (popupWindow.isVisible()) {
      hidePopupWindow(popupWindow);
      logPopupToggleState("toggle-after", popupWindow);
      return;
    }

    void platformRuntime.captureFocusTargetBeforePromptDisplay();
    showPopupWindow(popupWindow);
    popupWindow.webContents.send("popup:opened");
    logPopupToggleState("toggle-after", popupWindow);
  };

  const shortcutManager = createShortcutManager(togglePopup);
  const currentSettings = settingsStore.getSettings();
  const shortcutRegistration = shortcutManager.register(currentSettings.hotkey);
  applyLaunchAtLogin(currentSettings.launchAtLogin);
  const trayManager = createTrayManager({
    togglePopup,
    openManager: () => {
      if (!managerWindow || managerWindow.isDestroyed()) {
        managerWindow = createManagerWindow();
      }

      managerWindow.show();
      managerWindow.focus();
    },
    openSettings: () => {
      if (!settingsWindow || settingsWindow.isDestroyed()) {
        settingsWindow = createSettingsWindow();
      }

      settingsWindow.show();
      settingsWindow.focus();
    },
    toggleLaunchAtLogin: (enabled) => {
      applyLaunchAtLogin(enabled);
      const nextSettings = settingsStore.updateSettings({ launchAtLogin: enabled });
      trayManager.refresh(nextSettings);
    }
  });
  trayManager.refresh(currentSettings);

  ipcMain.handle("prompts:list", async () => {
    const library = await promptLibraryStore.getLibrary();

    return {
      packs: library.packs.map((pack) => ({
        ...pack,
        items: historyStore.annotatePrompts(pack.items)
      })),
      items: historyStore.annotatePrompts(library.items)
    };
  });

  ipcMain.handle("prompts:open-folder", async () => {
    await openPathOrThrow(shell.openPath, promptsDirectory);
    return { ok: true };
  });

  ipcMain.handle("prompts:save-file", (_, payload: { sourceFile: string; packs: never[] }) => {
    savePromptFile(promptsDirectory, payload);
    promptLibraryStore.invalidate();
    return { ok: true };
  });

  ipcMain.handle(
    "prompts:quick-add",
    async (_, payload: { packId: string; title: string; body: string }) => {
      const library = await promptLibraryStore.getLibrary();
      const pack = library.packs.find((p) => p.id === payload.packId);

      if (!pack) {
        throw new Error(`Pack not found: ${payload.packId}`);
      }

      const result = quickAddPrompt(promptsDirectory, payload, pack.sourceFile);
      promptLibraryStore.invalidate();

      return result;
    }
  );

  ipcMain.handle("prompts:open-source", async (_, filePath: string) => {
    const safePath = assertPromptFilePath(promptsDirectory, filePath);
    await openPathOrThrow(shell.openPath, safePath);
    return { ok: true };
  });

  ipcMain.handle("app:get-permissions", () => {
    return platformRuntime.getAccessibilityStatus();
  });

  ipcMain.handle("app:get-settings", () => {
    const settings = settingsStore.getSettings();

    return {
      ...settings,
      activeHotkey: shortcutManager.getActiveHotkey(),
      hotkeyRegistered: shortcutManager.isRegistered()
    };
  });

  ipcMain.handle(
    "app:update-settings",
    (_, partial: {
      hotkey?: string;
      launchAtLogin?: boolean;
      locale?: "en" | "zh-CN";
      packOrder?: string[];
      promptOrder?: string[];
      customPromptsDirectory?: string;
      settingsSectionOrder?: string[];
    }) => {
    const current = settingsStore.getSettings();
    const updatePlan = createSettingsUpdatePlan(current, partial);

    if (updatePlan.needsHotkeyRegistration) {
      const shortcutResult = shortcutManager.register(updatePlan.next.hotkey);

      if (!shortcutResult.registered) {
        shortcutManager.register(current.hotkey);

        return {
          ...current,
          activeHotkey: shortcutManager.getActiveHotkey(),
          hotkeyRegistered: shortcutManager.isRegistered(),
          registered: false
        };
      }
    }

    const nextSettings = settingsStore.updateSettings(partial);
    applyLaunchAtLogin(nextSettings.launchAtLogin);
    trayManager.refresh(nextSettings);

    if (
      typeof partial.customPromptsDirectory === "string" &&
      partial.customPromptsDirectory !== current.customPromptsDirectory
    ) {
      promptLibraryStore.dispose();
      promptsDirectory = resolvePromptsDirectory(nextSettings.customPromptsDirectory);
      promptLibraryStore = createPromptLibraryStore(promptsDirectory, {
        loadPromptLibrary: loadPromptLibraryAsync
      });
    }

    return {
      ...nextSettings,
      activeHotkey: shortcutManager.getActiveHotkey(),
      hotkeyRegistered: shortcutManager.isRegistered(),
      registered: true
    };
    }
  );

  ipcMain.handle("app:request-accessibility", () => {
    return platformRuntime.promptForAccessibilityAccess();
  });

  ipcMain.handle("app:select-prompts-directory", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "Select Prompts Directory"
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { selected: false, directory: "" };
    }

    return { selected: true, directory: result.filePaths[0] };
  });

  ipcMain.handle("app:open-manager", () => {
    if (!managerWindow || managerWindow.isDestroyed()) {
      managerWindow = createManagerWindow();
    }

    managerWindow.show();
    managerWindow.focus();
    return { ok: true };
  });

  ipcMain.handle("app:open-settings", () => {
    if (!settingsWindow || settingsWindow.isDestroyed()) {
      settingsWindow = createSettingsWindow();
    }

    settingsWindow.show();
    settingsWindow.focus();
    return { ok: true };
  });

  ipcMain.handle(
    "prompts:confirm-selection",
    async (
      _,
      payload: {
        promptId: string;
        variables: Record<string, string>;
        deliveryMode?: "auto" | "clipboard";
      }
    ) => {
      const library = await promptLibraryStore.getLibrary();
      const prompt = library.items.find((item) => item.id === payload.promptId);

      if (!prompt) {
        throw new Error(`Prompt not found: ${payload.promptId}`);
      }

      return executePromptSelection({
        prompt,
        variables: payload.variables,
        deliveryMode: payload.deliveryMode,
        popupWindow,
        renderPromptBody: (p, v) => renderPromptBody(p, v, library.items),
        pasteText,
        writeClipboard: (text) => clipboard.writeText(text),
        appendToFile: (filePath, text) => {
          mkdirSync(dirname(filePath), { recursive: true });
          appendFileSync(filePath, text, "utf8");
        },
        runShellCommand: (command, stdin) => {
          runPlatformShellCommand(command, stdin, {
            onError: (error) => {
              console.error("[after-action:shell]", error);
            }
          });
        },
        recordUsage: (record) => {
          historyStore.recordUsage(record);
        },
        hidePopupWindow,
        restoreAppFocus: () => platformRuntime.restoreAppFocusAfterPromptSelection(),
        showPopupWindow,
        notifyPopupOpened: () => {
          popupWindow.webContents.send("popup:opened");
        },
        notifyClipboardFallback: (message) => {
          if (Notification.isSupported()) {
            new Notification({
              title: "PromptBar",
              body: message
            }).show();
            return;
          }

          console.warn(`[prompt-selection:fallback] ${message}`);
        },
        wait: (milliseconds) =>
          new Promise((resolve) => {
            setTimeout(resolve, milliseconds);
          }),
        readClipboardText: () => clipboard.readText()
      });
    }
  );

  ipcMain.on("popup:hide", () => {
    if (!popupWindow.isDestroyed()) {
      hidePopupWindow(popupWindow);
    }
  });

  app.on("activate", () => {
    if (popupWindow.isDestroyed()) {
      popupWindow = createPopupWindow();
    }

    void platformRuntime.captureFocusTargetBeforePromptDisplay();
    showPopupWindow(popupWindow);
    popupWindow.webContents.send("popup:opened");
  });

  app.on("before-quit", handleBeforeQuit);

  powerMonitor.on("resume", () => {
    console.info("[power:resume] Re-registering global shortcut after system wake.");

    const result = shortcutManager.reRegister();

    if (!result.registered) {
      console.warn("[power:resume] Failed to re-register shortcut. Active:", result.activeHotkey);
    }

    if (!popupWindow.isDestroyed() && popupWindow.webContents.isCrashed()) {
      console.warn("[power:resume] Popup renderer crashed during sleep, recreating window.");
      popupWindow.destroy();
      popupWindow = createPopupWindow();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  console.info(
    `PromptBar is ready. Toggle popup with ${
      shortcutRegistration.registered
        ? shortcutManager.getActiveHotkey()
        : DEFAULT_HOTKEY
    }.`
  );
}

app.whenReady().then(bootstrap);

function applyLaunchAtLogin(enabled: boolean) {
  if (!app.isPackaged) {
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true
  });
}
