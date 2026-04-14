import {
  applyPromptBarActivationPolicy,
  type ActivationPolicyApp
} from "./app-activation.js";
import type { AccessibilityStatus } from "./permissions.js";
import {
  captureNativeForegroundWindow,
  restoreNativeForegroundWindow
} from "./native-paste.js";

export type VisibleWindowLike = {
  isDestroyed: () => boolean;
  isVisible: () => boolean;
};

type HideableApp = ActivationPolicyApp & {
  hide?: () => void;
};

export type PlatformRuntimeAdapter = {
  platform: NodeJS.Platform;
  applyActivationPolicy: () => boolean;
  getAccessibilityStatus: () => AccessibilityStatus;
  promptForAccessibilityAccess: () => AccessibilityStatus;
  captureFocusTargetBeforePromptDisplay: () => Promise<void>;
  restoreAppFocusAfterPromptSelection: () => Promise<void>;
};

export function createPlatformRuntimeAdapter(options: {
  app: HideableApp;
  platform?: NodeJS.Platform;
  getManagerWindow?: () => VisibleWindowLike | null;
  getSettingsWindow?: () => VisibleWindowLike | null;
  getAccessibilityStatus?: () => AccessibilityStatus;
  promptForAccessibilityAccess?: () => AccessibilityStatus;
  captureFocusTarget?: () => Promise<boolean> | boolean;
  restoreFocusTarget?: () => Promise<boolean> | boolean;
}): PlatformRuntimeAdapter {
  const platform = options.platform ?? process.platform;
  const getAccessibilityStatus = options.getAccessibilityStatus ?? (() => ({
    accessible: true,
    platform
  }));
  const promptForAccessibilityAccess = options.promptForAccessibilityAccess ?? (() => ({
    accessible: true,
    platform
  }));
  const captureFocusTarget = options.captureFocusTarget ?? (() => captureNativeForegroundWindow(platform));
  const restoreFocusTarget = options.restoreFocusTarget ?? (() => restoreNativeForegroundWindow(platform));

  return {
    platform,
    applyActivationPolicy: () => applyPromptBarActivationPolicy(options.app, platform),
    getAccessibilityStatus,
    promptForAccessibilityAccess,
    captureFocusTargetBeforePromptDisplay: async () => {
      if (platform !== "win32") {
        return;
      }

      if (hasVisibleAuxiliaryWindow(options)) {
        return;
      }

      await captureFocusTarget();
    },
    restoreAppFocusAfterPromptSelection: async () => {
      if (hasVisibleAuxiliaryWindow(options)) {
        return;
      }

      if (platform === "darwin") {
        if (typeof options.app.hide !== "function") {
          return;
        }

        options.app.hide();
        return;
      }

      if (platform !== "win32") {
        return;
      }

      await restoreFocusTarget();
    }
  };
}

function hasVisibleAuxiliaryWindow(options: {
  getManagerWindow?: () => VisibleWindowLike | null;
  getSettingsWindow?: () => VisibleWindowLike | null;
}) {
  return [
    options.getManagerWindow?.() ?? null,
    options.getSettingsWindow?.() ?? null
  ].some(isVisibleWindow);
}

function isVisibleWindow(windowLike: VisibleWindowLike | null) {
  if (!windowLike || windowLike.isDestroyed()) {
    return false;
  }

  return windowLike.isVisible();
}
