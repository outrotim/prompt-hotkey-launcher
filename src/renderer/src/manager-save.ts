import type { PromptPack } from "../../shared/types";

export type PromptFileSavePlan = {
  sourceFile: string;
  packs: PromptPack[];
};

export function addDirtyPromptFiles(
  currentDirtySourceFiles: Iterable<string>,
  ...sourceFiles: string[]
) {
  const nextDirtySourceFiles = new Set(currentDirtySourceFiles);

  for (const sourceFile of sourceFiles) {
    if (sourceFile) {
      nextDirtySourceFiles.add(sourceFile);
    }
  }

  return nextDirtySourceFiles;
}

export function removeDirtyPromptFiles(
  currentDirtySourceFiles: Iterable<string>,
  ...sourceFiles: string[]
) {
  const nextDirtySourceFiles = new Set(currentDirtySourceFiles);

  for (const sourceFile of sourceFiles) {
    nextDirtySourceFiles.delete(sourceFile);
  }

  return nextDirtySourceFiles;
}

export function buildPromptFileSavePlan(
  packs: PromptPack[],
  dirtySourceFiles: Iterable<string>
) {
  const groupedPacks = new Map<string, PromptPack[]>();

  for (const pack of packs) {
    const existingPacks = groupedPacks.get(pack.sourceFile);

    if (existingPacks) {
      existingPacks.push(pack);
      continue;
    }

    groupedPacks.set(pack.sourceFile, [pack]);
  }

  return [...new Set(dirtySourceFiles)]
    .sort((left, right) => left.localeCompare(right, "en"))
    .map<PromptFileSavePlan>((sourceFile) => ({
      sourceFile,
      packs: groupedPacks.get(sourceFile) ?? []
    }));
}

export function shouldConfirmReloadMarkdown(dirtySourceFiles: Iterable<string>) {
  return [...dirtySourceFiles].length > 0;
}

export function buildReloadConfirmationMessage(
  dirtySourceFiles: Iterable<string>,
  t: (english: string, chinese?: string) => string
) {
  const dirtyFileCount = [...dirtySourceFiles].length;

  if (dirtyFileCount <= 0) {
    throw new Error("Reload confirmation message requested without unsaved changes.");
  }

  if (dirtyFileCount === 1) {
    return t(
      "Reloading Markdown will discard 1 unsaved file change. Continue?",
      "重新加载 Markdown 会丢弃 1 个未保存文件的改动。要继续吗？"
    );
  }

  return t(
    `Reloading Markdown will discard ${dirtyFileCount} unsaved file changes. Continue?`,
    `重新加载 Markdown 会丢弃 ${dirtyFileCount} 个未保存文件的改动。要继续吗？`
  );
}
