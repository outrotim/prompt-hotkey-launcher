import { systemPreferences } from "electron";

export type AccessibilityStatus = {
  accessible: boolean;
  platform: NodeJS.Platform;
};

export function getAccessibilityStatus(): AccessibilityStatus {
  if (process.platform !== "darwin") {
    return {
      accessible: true,
      platform: process.platform
    };
  }

  return {
    accessible: systemPreferences.isTrustedAccessibilityClient(false),
    platform: process.platform
  };
}

export function promptForAccessibilityAccess() {
  if (process.platform !== "darwin") {
    return {
      accessible: true,
      platform: process.platform
    };
  }

  return {
    accessible: systemPreferences.isTrustedAccessibilityClient(true),
    platform: process.platform
  };
}
