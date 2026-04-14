import { Menu, Tray, app, nativeImage } from "electron";
import type { AppSettings } from "./settings";
import { buildTrayMenuSpec, resolveTrayAssetPath, shouldUseTemplateTrayImage } from "./tray-config";

type TrayManagerOptions = {
  togglePopup: () => void;
  openManager: () => void;
  openSettings: () => void;
  toggleLaunchAtLogin: (enabled: boolean) => void;
};

export function createTrayManager(options: TrayManagerOptions) {
  let tray: Tray | null = null;

  const ensureTray = (settings: AppSettings) => {
    if (!tray) {
      const icon = nativeImage.createFromPath(
        resolveTrayAssetPath(app.isPackaged, process.resourcesPath, app.getAppPath(), process.platform)
      );
      if (shouldUseTemplateTrayImage(process.platform)) {
        icon.setTemplateImage(true);
      }
      tray = new Tray(icon);
      tray.setToolTip("PromptBar");
    }

    tray.setContextMenu(
      Menu.buildFromTemplate([
        ...buildTrayMenuSpec(settings.launchAtLogin).map((item) => {
          if (item.type === "separator") {
            return { type: "separator" as const };
          }

          if (item.action === "toggleLaunchAtLogin") {
            return {
              label: item.label,
              type: "checkbox" as const,
              checked: item.checked,
              click: (menuItem: { checked: boolean }) => {
                options.toggleLaunchAtLogin(Boolean(menuItem.checked));
              }
            };
          }

          return {
            label: item.label,
            type: "normal" as const,
            click: () => {
              if (item.action === "togglePopup") {
                options.togglePopup();
                return;
              }

              if (item.action === "openManager") {
                options.openManager();
                return;
              }

              if (item.action === "openSettings") {
                options.openSettings();
                return;
              }

              app.quit();
            }
          };
        })
      ])
    );

    return tray;
  };

  return {
    refresh: (settings: AppSettings) => {
      ensureTray(settings);
    }
  };
}
