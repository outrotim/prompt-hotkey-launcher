import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { syncBundledPromptsIntoUserDirectory } from "./prompt-directory-sync";

export function resolvePromptsDirectory(customPath: string): string {
  if (customPath && existsSync(customPath) && statSync(customPath).isDirectory()) {
    return customPath;
  }

  return ensureUserPromptsDirectory();
}

export function ensureUserPromptsDirectory() {
  const userPromptsDirectory = join(app.getPath("userData"), "prompts");
  const bundledPromptsDirectory = getBundledPromptsDirectory();

  syncBundledPromptsIntoUserDirectory({ bundledPromptsDirectory, userPromptsDirectory });

  return userPromptsDirectory;
}

function getBundledPromptsDirectory() {
  if (app.isPackaged) {
    return join(process.resourcesPath, "prompts");
  }

  return join(app.getAppPath(), "prompts");
}
