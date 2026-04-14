import { join } from "node:path";

export type TrayMenuAction =
  | "togglePopup"
  | "openManager"
  | "openSettings"
  | "toggleLaunchAtLogin"
  | "quit";

export type TrayMenuSpecItem =
  | { type: "separator" }
  | {
      type: "action" | "checkbox";
      label: string;
      action: TrayMenuAction;
      checked?: boolean;
    };

export function resolveTrayAssetPath(
  appIsPackaged: boolean,
  resourcesPath: string,
  appPath: string,
  platform: NodeJS.Platform = process.platform
) {
  const fileName = platform === "darwin" ? "TrayTemplate.png" : "app-icon.ico";

  if (appIsPackaged) {
    return join(resourcesPath, fileName);
  }

  return join(appPath, "resources", fileName);
}

export function shouldUseTemplateTrayImage(platform: NodeJS.Platform = process.platform) {
  return platform === "darwin";
}

export function buildTrayMenuSpec(launchAtLogin: boolean): TrayMenuSpecItem[] {
  return [
    { type: "action", label: "Toggle PromptBar", action: "togglePopup" },
    { type: "action", label: "Open Manager", action: "openManager" },
    { type: "action", label: "Open Settings", action: "openSettings" },
    { type: "separator" },
    {
      type: "checkbox",
      label: "Launch at Login",
      action: "toggleLaunchAtLogin",
      checked: launchAtLogin
    },
    { type: "separator" },
    { type: "action", label: "Quit PromptBar", action: "quit" }
  ];
}
