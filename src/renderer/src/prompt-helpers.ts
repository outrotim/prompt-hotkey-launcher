import type { PromptFileMetadata, PromptItem, PromptPack } from "../../shared/types";
import { slugify } from "../../shared/slugify.js";

export function shouldUsePrimaryConfirmShortcut(
  eventKey: string,
  query: string,
  selectedPrompt: Pick<PromptItem, "variables"> | null
) {
  if (eventKey === "Enter") {
    return true;
  }

  if (eventKey !== "1") {
    return false;
  }

  return query.trim() !== "" || Boolean(selectedPrompt?.variables.length);
}

export function createDefaultMetadata(): PromptFileMetadata {
  return {
    favorite: false,
    tags: [],
    aliases: []
  };
}

export function createPack(sourceFile: string, packName: string): PromptPack {
  return {
    id: `${slugify(getPromptFileStem(sourceFile))}-${slugify(packName)}-${Date.now()}`,
    name: packName,
    sourceFile,
    metadata: createDefaultMetadata(),
    items: []
  };
}

export function createPrompt(pack: PromptPack): PromptItem {
  const title = `新提示词 ${pack.items.length + 1}`;

  return {
    id: `${pack.id}:${slugify(title)}-${Date.now()}`,
    packId: pack.id,
    title,
    body: "请在这里输入提示词正文。",
    description: "请在这里输入提示词正文。",
    favorite: pack.metadata.favorite,
    tags: pack.metadata.tags,
    aliases: pack.metadata.aliases,
    variables: [],
    sourceFile: pack.sourceFile
  };
}

function getPromptFileStem(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1).replace(/\.md$/i, "");
}
