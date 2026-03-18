import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  // Popup
  getPacks: () => ipcRenderer.invoke(IPC_CHANNELS.GET_PACKS),
  searchPrompts: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_PROMPTS, query),
  insertPrompt: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.INSERT_PROMPT, text),
  getRecent: () => ipcRenderer.invoke(IPC_CHANNELS.GET_RECENT),
  toggleFavorite: (promptId: string) => ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_FAVORITE, promptId),
  hidePopup: () => ipcRenderer.invoke(IPC_CHANNELS.HIDE_POPUP),

  // Variables
  getVariableHistory: (varName: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_VARIABLE_HISTORY, varName),
  saveVariableHistory: (varName: string, value: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_VARIABLE_HISTORY, varName, value),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  saveSettings: (settings: any) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings),

  // Manager
  getAllPacks: () => ipcRenderer.invoke(IPC_CHANNELS.GET_ALL_PACKS),
  savePack: (pack: any) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_PACK, pack),
  deletePack: (packId: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_PACK, packId),
  savePrompt: (packId: string, prompt: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_PROMPT, packId, prompt),
  deletePrompt: (packId: string, promptId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DELETE_PROMPT, packId, promptId),
  importMarkdown: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.IMPORT_MARKDOWN, filePath),

  // Window
  openManager: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_MANAGER),
  openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_SETTINGS),

  // Events
  onPopupShown: (callback: () => void) => {
    ipcRenderer.on('popup-shown', callback);
    return () => ipcRenderer.removeListener('popup-shown', callback);
  },
});
