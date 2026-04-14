export const DEFAULT_HOTKEY = "Control+Q";

export type ShortcutDependencies = {
  app: {
    on: (event: "will-quit", listener: () => void) => void;
  };
  globalShortcut: {
    register: (accelerator: string, callback: () => void) => boolean;
    unregister: (accelerator: string) => void;
    unregisterAll: () => void;
  };
  warn: (message: string) => void;
};

export function createShortcutManagerCore(
  togglePopup: () => void,
  dependencies: ShortcutDependencies
) {
  let activeHotkey: string | null = null;
  let hasRegisteredHotkey = false;

  dependencies.app.on("will-quit", () => {
    dependencies.globalShortcut.unregisterAll();
  });

  const register = (hotkey: string) => {
    if (hasRegisteredHotkey && hotkey === activeHotkey) {
      return {
        registered: true,
        activeHotkey
      };
    }

    const previousHotkey = hasRegisteredHotkey ? activeHotkey : null;
    const registered = dependencies.globalShortcut.register(hotkey, togglePopup);

    if (registered) {
      if (previousHotkey && previousHotkey !== hotkey) {
        dependencies.globalShortcut.unregister(previousHotkey);
      }

      activeHotkey = hotkey;
      hasRegisteredHotkey = true;
    } else {
      dependencies.warn(`Failed to register global shortcut: ${hotkey}`);
    }

    return {
      registered,
      activeHotkey: hasRegisteredHotkey ? activeHotkey : null
    };
  };

  const reRegister = () => {
    if (!hasRegisteredHotkey || !activeHotkey) {
      return { registered: false, activeHotkey: null };
    }

    const hotkey = activeHotkey;

    dependencies.globalShortcut.unregister(hotkey);

    hasRegisteredHotkey = false;
    activeHotkey = null;

    return register(hotkey);
  };

  return {
    register,
    reRegister,
    getActiveHotkey: () => (hasRegisteredHotkey ? activeHotkey : null),
    isRegistered: () => hasRegisteredHotkey
  };
}
