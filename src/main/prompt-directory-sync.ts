import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

export function syncBundledPromptsIntoUserDirectory({
  bundledPromptsDirectory,
  userPromptsDirectory
}: {
  bundledPromptsDirectory: string;
  userPromptsDirectory: string;
}) {
  mkdirSync(userPromptsDirectory, { recursive: true });

  if (!existsSync(bundledPromptsDirectory)) {
    return;
  }

  syncMissingPromptEntries(bundledPromptsDirectory, userPromptsDirectory);
}

function syncMissingPromptEntries(sourceDirectory: string, targetDirectory: string) {
  const entries = readdirSync(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = join(sourceDirectory, entry.name);
    const targetPath = join(targetDirectory, entry.name);

    if (entry.isDirectory()) {
      syncMissingPromptEntries(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile() || existsSync(targetPath)) {
      continue;
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath);
  }
}
