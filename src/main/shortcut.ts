import { globalShortcut } from 'electron';
import Store from 'electron-store';
import { showPopup, hidePopup, getPopupWindow } from './window';
import { DEFAULT_SETTINGS, AppSettings } from '../shared/types';

const settingsStore = new Store<AppSettings>({
  name: 'settings',
  defaults: DEFAULT_SETTINGS,
});

let currentShortcut: string = '';

/** Register the global shortcut */
export function registerShortcut(): void {
  const shortcut = settingsStore.get('shortcut', DEFAULT_SETTINGS.shortcut);
  setShortcut(shortcut);
}

/** Update the global shortcut */
export function setShortcut(shortcut: string): boolean {
  if (currentShortcut) {
    globalShortcut.unregister(currentShortcut);
  }
  const electronShortcut = shortcut.replace('Control', 'Ctrl');
  try {
    const success = globalShortcut.register(electronShortcut, () => {
      const popup = getPopupWindow();
      if (popup && !popup.isDestroyed() && popup.isVisible()) {
        hidePopup();
      } else {
        showPopup();
      }
    });
    if (success) {
      currentShortcut = electronShortcut;
      settingsStore.set('shortcut', shortcut);
    }
    return success;
  } catch {
    return false;
  }
}

/** Get current settings */
export function getSettings(): AppSettings {
  return {
    shortcut: settingsStore.get('shortcut', DEFAULT_SETTINGS.shortcut),
    maxRecentItems: settingsStore.get('maxRecentItems', DEFAULT_SETTINGS.maxRecentItems),
    promptsDir: settingsStore.get('promptsDir', DEFAULT_SETTINGS.promptsDir),
    theme: settingsStore.get('theme', DEFAULT_SETTINGS.theme),
  };
}

/** Save settings */
export function saveSettings(settings: Partial<AppSettings>): void {
  if (settings.shortcut) {
    setShortcut(settings.shortcut);
  }
  const current = getSettings();
  const merged = { ...current, ...settings };
  settingsStore.set(merged);
}

/** Unregister on quit */
export function unregisterAll(): void {
  globalShortcut.unregisterAll();
}
