import { contextBridge, ipcRenderer } from "electron";
import type { PromptLibrary, PromptPack, PromptSelectionPayload } from "../shared/types";

contextBridge.exposeInMainWorld("promptBar", {
  platform: process.platform,
  listPrompts: () => {
    return ipcRenderer.invoke("prompts:list") as Promise<PromptLibrary>;
  },
  confirmSelection: (payload: PromptSelectionPayload) => {
    return ipcRenderer.invoke("prompts:confirm-selection", payload) as Promise<{
      ok: boolean;
      renderedText: string;
      delivery?: "default" | "clipboard-fallback" | "clipboard-manual";
      message?: string;
    }>;
  },
  quickAddPrompt: (payload: { packId: string; title: string; body: string }) => {
    return ipcRenderer.invoke("prompts:quick-add", payload) as Promise<{
      ok: boolean;
      promptId: string;
    }>;
  },
  openPromptsFolder: () => {
    return ipcRenderer.invoke("prompts:open-folder") as Promise<{ ok: boolean }>;
  },
  openPromptSource: (filePath: string) => {
    return ipcRenderer.invoke("prompts:open-source", filePath) as Promise<{ ok: boolean }>;
  },
  savePromptFile: (payload: { sourceFile: string; packs: PromptPack[] }) => {
    return ipcRenderer.invoke("prompts:save-file", payload) as Promise<{ ok: boolean }>;
  },
  getPermissions: () => {
    return ipcRenderer.invoke("app:get-permissions") as Promise<{
      accessible: boolean;
      platform: NodeJS.Platform;
    }>;
  },
  getSettings: () => {
    return ipcRenderer.invoke("app:get-settings") as Promise<{
      hotkey: string;
      launchAtLogin: boolean;
      locale: "en" | "zh-CN";
      packOrder: string[];
      promptOrder: string[];
      customPromptsDirectory: string;
      settingsSectionOrder: string[];
      activeHotkey: string | null;
      hotkeyRegistered: boolean;
    }>;
  },
  updateSettings: (partial: {
      hotkey?: string;
      launchAtLogin?: boolean;
      locale?: "en" | "zh-CN";
      packOrder?: string[];
      promptOrder?: string[];
      customPromptsDirectory?: string;
      settingsSectionOrder?: string[];
    }) => {
    return ipcRenderer.invoke("app:update-settings", partial) as Promise<{
      hotkey: string;
      launchAtLogin: boolean;
      locale: "en" | "zh-CN";
      packOrder: string[];
      promptOrder: string[];
      customPromptsDirectory: string;
      settingsSectionOrder: string[];
      activeHotkey: string | null;
      hotkeyRegistered: boolean;
      registered: boolean;
    }>;
  },
  selectPromptsDirectory: () => {
    return ipcRenderer.invoke("app:select-prompts-directory") as Promise<{
      selected: boolean;
      directory: string;
    }>;
  },
  requestAccessibilityAccess: () => {
    return ipcRenderer.invoke("app:request-accessibility") as Promise<{
      accessible: boolean;
      platform: NodeJS.Platform;
    }>;
  },
  openManager: () => {
    return ipcRenderer.invoke("app:open-manager") as Promise<{ ok: boolean }>;
  },
  openSettings: () => {
    return ipcRenderer.invoke("app:open-settings") as Promise<{ ok: boolean }>;
  },
  onPopupOpened: (callback: () => void) => {
    const listener = () => {
      callback();
    };

    ipcRenderer.on("popup:opened", listener);

    return () => {
      ipcRenderer.removeListener("popup:opened", listener);
    };
  },
  hidePopup: () => {
    ipcRenderer.send("popup:hide");
  }
});
