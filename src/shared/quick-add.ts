import { join } from "node:path";
import { slugify } from "./slugify.js";
import type { PromptItem, PromptPack } from "./types";

export type QuickAddPromptPayload = {
  packId: string;
  title: string;
  body: string;
};

export function buildQuickAddPromptResult(
  packs: PromptPack[],
  payload: QuickAddPromptPayload,
  now = Date.now()
) {
  const targetPack = packs.find((pack) => pack.id === payload.packId);

  if (!targetPack) {
    throw new Error(`Pack not found: ${payload.packId}`);
  }

  const title = payload.title.trim() || `新提示词 ${targetPack.items.length + 1}`;
  const body = payload.body.trim() || "请在这里输入提示词正文。";
  const promptId = `${targetPack.id}:${slugify(title)}-${now}`;
  const nextPrompt: PromptItem = {
    id: promptId,
    packId: targetPack.id,
    title,
    body,
    description: "",
    favorite: targetPack.metadata.favorite,
    tags: [...targetPack.metadata.tags],
    aliases: [...targetPack.metadata.aliases],
    variables: [],
    sourceFile: targetPack.sourceFile,
    ...(targetPack.metadata.output ? { output: targetPack.metadata.output } : {}),
    ...(targetPack.metadata.outputFile ? { outputFile: targetPack.metadata.outputFile } : {}),
    ...(targetPack.metadata.after ? { after: targetPack.metadata.after } : {})
  };

  return {
    promptId,
    nextPacks: packs.map((pack) =>
      pack.id === targetPack.id
        ? {
            ...pack,
            items: [...pack.items, nextPrompt]
          }
        : pack
    )
  };
}

export function buildQuickAddDirectoryPromptFile(
  targetPack: PromptPack,
  payload: QuickAddPromptPayload,
  now = Date.now()
) {
  const title = payload.title.trim() || `新提示词 ${targetPack.items.length + 1}`;
  const body = payload.body.trim() || "请在这里输入提示词正文。";
  const promptId = `${targetPack.id}:${slugify(title)}-${now}`;
  const fileName = `${buildUniquePromptFileName(targetPack, title)}.md`;
  const filePath = join(resolveDirectoryPackPath(targetPack.sourceFile), fileName);

  return {
    promptId,
    filePath,
    content: `<!-- promptbar:id=${promptId} -->\n${body}\n`
  };
}

function resolveDirectoryPackPath(sourceFile: string) {
  const lastSlashIndex = sourceFile.lastIndexOf("/");

  if (lastSlashIndex === -1) {
    throw new Error(`Directory pack source file must include a parent directory: ${sourceFile}`);
  }

  return sourceFile.slice(0, lastSlashIndex);
}

function buildUniquePromptFileName(targetPack: PromptPack, title: string) {
  const baseName = sanitizePromptFileName(title);
  const takenNames = new Set(
    targetPack.items.map((item) => sanitizePromptFileName(item.title).toLowerCase())
  );

  if (!takenNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let suffix = 2;

  while (takenNames.has(`${baseName}-${suffix}`.toLowerCase())) {
    suffix += 1;
  }

  return `${baseName}-${suffix}`;
}

function sanitizePromptFileName(value: string) {
  const sanitized = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^-+|-+$/g, "");

  return sanitized || "新提示词";
}
