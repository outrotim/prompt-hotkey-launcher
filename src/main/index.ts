import { app, ipcMain, dialog, BrowserWindow } from 'electron';
import * as path from 'path';
import { createTray } from './tray';
import { registerShortcut, unregisterAll, getSettings, saveSettings } from './shortcut';
import { showPopup, hidePopup, openManager, openSettings } from './window';
import { initStore, getPacks, savePack, deletePack, importMarkdownFile, getPromptsDir } from '../core/store';
import { searchPrompts } from '../core/search';
import { pasteToActiveApp } from './paste';
import { recordUsage, getRecentPrompts, toggleFavorite } from '../core/history';
import { getVariableInfos, fillVariables, getAllVariableHistory } from '../core/variable';
import { saveVariableValue, getVariableHistory } from '../core/history';
import { IPC_CHANNELS, PromptPack } from '../shared/types';
import { cleanup } from '../core/store';
import { autoUpdater } from 'electron-updater';

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Hide dock icon (menu bar app)
app.dock?.hide();

app.on('ready', async () => {
  const settings = getSettings();
  initStore(settings.promptsDir || undefined);
  registerShortcut();
  createTray();
  setupIPC();

  try {
    autoUpdater.checkForUpdatesAndNotify();
  } catch {
    // Ignore update errors
  }

  const packs = getPacks();
  if (packs.length === 0) {
    copySamplePrompts();
  }
});

app.on('will-quit', () => {
  unregisterAll();
  cleanup();
});

app.on('window-all-closed', (e: Event) => {
  e.preventDefault();
});

function setupIPC(): void {
  ipcMain.handle(IPC_CHANNELS.GET_PACKS, () => getPacks());
  ipcMain.handle(IPC_CHANNELS.SEARCH_PROMPTS, (_, query: string) => searchPrompts(query));
  ipcMain.handle(IPC_CHANNELS.HIDE_POPUP, () => hidePopup());
  ipcMain.handle(IPC_CHANNELS.GET_RECENT, () => getRecentPrompts());

  ipcMain.handle(IPC_CHANNELS.INSERT_PROMPT, async (_, text: string) => {
    hidePopup();
    await new Promise(resolve => setTimeout(resolve, 150));
    await pasteToActiveApp(text);
  });

  ipcMain.handle(IPC_CHANNELS.TOGGLE_FAVORITE, (_, promptId: string) => {
    return toggleFavorite(promptId);
  });

  ipcMain.handle(IPC_CHANNELS.GET_VARIABLE_HISTORY, (_, varName: string) => {
    return getVariableHistory(varName);
  });
  ipcMain.handle(IPC_CHANNELS.SAVE_VARIABLE_HISTORY, (_, varName: string, value: string) => {
    saveVariableValue(varName, value);
  });

  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => ({
    ...getSettings(),
    promptsDir: getPromptsDir(),
  }));
  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, (_, settings) => saveSettings(settings));

  ipcMain.handle(IPC_CHANNELS.GET_ALL_PACKS, () => getPacks());
  ipcMain.handle(IPC_CHANNELS.SAVE_PACK, (_, pack: PromptPack) => savePack(pack));
  ipcMain.handle(IPC_CHANNELS.DELETE_PACK, (_, packId: string) => deletePack(packId));
  ipcMain.handle(IPC_CHANNELS.IMPORT_MARKDOWN, async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled) return null;
    const imported = result.filePaths.map(fp => importMarkdownFile(fp));
    return imported.filter(Boolean);
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_MANAGER, () => openManager());
  ipcMain.handle(IPC_CHANNELS.OPEN_SETTINGS, () => openSettings());
}

function copySamplePrompts(): void {
  const fs = require('fs');
  const sampleDir = path.join(__dirname, '../../../prompts');
  const targetDir = getPromptsDir();

  if (fs.existsSync(sampleDir)) {
    const files = fs.readdirSync(sampleDir).filter((f: string) => f.endsWith('.md'));
    for (const file of files) {
      const src = path.join(sampleDir, file);
      const dest = path.join(targetDir, file);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
      }
    }
    const { reloadPacks } = require('../core/store');
    reloadPacks();
  }
}
