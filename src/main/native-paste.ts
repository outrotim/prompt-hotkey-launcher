import { createRequire } from "node:module";

type NativePasteModule = {
  pasteCommandV?: () => void;
  pasteControlV?: () => void;
  captureForegroundWindow?: () => boolean;
  restoreForegroundWindow?: () => boolean;
};

const require = createRequire(import.meta.url);
const cachedNativePasteModules = new Map<NodeJS.Platform, NativePasteModule | null>();

export async function runNativePasteHelper(platform = process.platform) {
  await runNativePasteWithLoader(() => loadNativePasteModule(platform), platform);
}

export async function captureNativeForegroundWindow(platform = process.platform) {
  return runNativeWindowActionWithLoader(
    () => loadNativePasteModule(platform),
    "captureForegroundWindow",
    platform
  );
}

export async function restoreNativeForegroundWindow(platform = process.platform) {
  return runNativeWindowActionWithLoader(
    () => loadNativePasteModule(platform),
    "restoreForegroundWindow",
    platform
  );
}

export async function runNativePasteWithLoader(
  loadModule: () => NativePasteModule,
  platform = process.platform
) {
  const nativePasteModule = loadModule();
  const exportName = getNativePasteExportName(platform);
  const pasteShortcut = nativePasteModule[exportName];

  if (typeof pasteShortcut !== "function") {
    throw new Error(`Native paste module for ${platform} must expose ${exportName}()`);
  }

  pasteShortcut();
}

function loadNativePasteModule(platform = process.platform) {
  if (platform !== "darwin" && platform !== "win32") {
    throw new Error(`Native paste module is unsupported on ${platform}`);
  }

  const cachedNativePasteModule = cachedNativePasteModules.get(platform);

  if (cachedNativePasteModule) {
    return cachedNativePasteModule;
  }

  if (cachedNativePasteModule === null) {
    throw new Error(`Native paste module is unavailable on ${platform}`);
  }

  try {
    const nativePasteModule = require("promptbar-native-paste") as NativePasteModule;

    cachedNativePasteModules.set(platform, nativePasteModule);
    return nativePasteModule;
  } catch (error) {
    cachedNativePasteModules.set(platform, null);
    throw error;
  }
}

function getNativePasteExportName(platform: NodeJS.Platform): keyof NativePasteModule {
  if (platform === "win32") {
    return "pasteControlV";
  }

  return "pasteCommandV";
}

function getNativeWindowActionExportName(
  action: "captureForegroundWindow" | "restoreForegroundWindow",
  platform: NodeJS.Platform
): keyof NativePasteModule {
  if (platform !== "win32") {
    throw new Error(`Native window focus action ${action} is unsupported on ${platform}`);
  }

  return action;
}

export async function runNativeWindowActionWithLoader(
  loadModule: () => NativePasteModule,
  action: "captureForegroundWindow" | "restoreForegroundWindow",
  platform = process.platform
) {
  const nativePasteModule = loadModule();
  const exportName = getNativeWindowActionExportName(action, platform);
  const nativeAction = nativePasteModule[exportName];

  if (typeof nativeAction !== "function") {
    throw new Error(`Native paste module for ${platform} must expose ${exportName}()`);
  }

  return nativeAction();
}
