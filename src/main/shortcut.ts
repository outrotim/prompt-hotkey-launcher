import { app, globalShortcut } from "electron";
import {
  createShortcutManagerCore,
  type ShortcutDependencies
} from "./shortcut-core";

export { DEFAULT_HOTKEY } from "./shortcut-core";

const defaultDependencies: ShortcutDependencies = {
  app,
  globalShortcut,
  warn: (message) => {
    console.warn(message);
  }
};

export function createShortcutManager(
  togglePopup: () => void,
  dependencies: ShortcutDependencies = defaultDependencies
) {
  return createShortcutManagerCore(togglePopup, dependencies);
}
