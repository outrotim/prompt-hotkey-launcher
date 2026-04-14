import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { writeFileAtomically } from "./atomic-write.js";
import { loadPromptLibrary, parsePromptFile } from "../core/parser.js";
import { serializePromptFile } from "../core/serializer.js";
import type { PromptItem, PromptPack } from "../shared/types";
import { assertDirectoryPackPath, assertPromptFilePath } from "./prompt-path.js";
import {
  buildQuickAddDirectoryPromptFile,
  buildQuickAddPromptResult,
  type QuickAddPromptPayload
} from "../shared/quick-add.js";

export type PromptFileSavePayload = {
  sourceFile: string;
  packs: PromptPack[];
};

export function savePromptFile(promptsDirectory: string, payload: PromptFileSavePayload) {
  if (isDirectoryPackSourceFile(payload.sourceFile)) {
    saveDirectoryPack(promptsDirectory, payload);
    return;
  }

  const sourceFile = assertPromptFilePath(promptsDirectory, payload.sourceFile);
  writeFileAtomically(sourceFile, serializePromptFile(payload.packs));
}

export function quickAddPrompt(
  promptsDirectory: string,
  payload: QuickAddPromptPayload,
  packSourceFile: string,
  now = Date.now()
) {
  if (isDirectoryPackSourceFile(packSourceFile)) {
    const library = loadPromptLibrary(promptsDirectory);
    const targetPack = library.packs.find((pack) => pack.id === payload.packId);

    if (!targetPack) {
      throw new Error(`Pack not found: ${payload.packId}`);
    }

    const result = buildQuickAddDirectoryPromptFile(targetPack, payload, now);
    const sourceFile = assertPromptFilePath(promptsDirectory, result.filePath);
    writeFileAtomically(sourceFile, result.content);

    return {
      ok: true as const,
      promptId: result.promptId
    };
  }

  const sourceFile = assertPromptFilePath(promptsDirectory, packSourceFile);
  const packs = parsePromptFile(sourceFile);
  const { promptId, nextPacks } = buildQuickAddPromptResult(packs, payload, now);

  writeFileAtomically(sourceFile, serializePromptFile(nextPacks));

  return {
    ok: true as const,
    promptId
  };
}

function isDirectoryPackSourceFile(sourceFile: string) {
  const extension = extname(sourceFile).toLowerCase();
  const fileName = basename(sourceFile).toLowerCase();
  return (extension === ".yaml" || extension === ".yml") && (fileName === "_pack.yaml" || fileName === "_pack.yml");
}

function saveDirectoryPack(promptsDirectory: string, payload: PromptFileSavePayload) {
  const sourceFile = assertDirectoryPackPath(promptsDirectory, payload.sourceFile);
  const packDirectory = dirname(sourceFile);

  if (payload.packs.length === 0) {
    removeDirectoryPack(sourceFile);
    return;
  }

  if (payload.packs.length !== 1) {
    throw new Error("Directory pack saves must contain exactly one pack.");
  }

  const [pack] = payload.packs;
  const promptFiles = buildDirectoryPackPromptFiles(promptsDirectory, pack, sourceFile);

  writeFileAtomically(sourceFile, serializeDirectoryPackYaml(pack));

  for (const promptFile of promptFiles) {
    writeFileAtomically(promptFile.filePath, promptFile.content);
  }

  const nextPromptFiles = new Set(promptFiles.map((promptFile) => promptFile.filePath));
  const currentMarkdownFiles = readdirSync(packDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".md")
    .map((entry) => join(packDirectory, entry.name));

  for (const filePath of currentMarkdownFiles) {
    if (!nextPromptFiles.has(filePath) && existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}

function removeDirectoryPack(sourceFile: string) {
  const packDirectory = dirname(sourceFile);
  const markdownFiles = readdirSync(packDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".md")
    .map((entry) => join(packDirectory, entry.name));

  for (const filePath of markdownFiles) {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  if (existsSync(sourceFile)) {
    unlinkSync(sourceFile);
  }
}

function buildDirectoryPackPromptFiles(
  promptsDirectory: string,
  pack: PromptPack,
  packSourceFile: string
) {
  const packDirectory = dirname(packSourceFile);
  const usedPromptFileNames = new Set<string>();

  return pack.items.map((item, index) => {
    const trimmedTitle = item.title.trim();

    if (!trimmedTitle) {
      throw new Error(`Directory pack prompt at position ${index + 1} is missing a title.`);
    }

    const fileName = `${buildUniqueDirectoryPromptFileStem(trimmedTitle, usedPromptFileNames)}.md`;
    const filePath = assertPromptFilePath(promptsDirectory, join(packDirectory, fileName));

    return {
      filePath,
      content: serializeDirectoryPromptBody(item)
    };
  });
}

function buildUniqueDirectoryPromptFileStem(title: string, usedPromptFileNames: Set<string>) {
  const stem = sanitizeDirectoryPromptFileStem(title);

  if (usedPromptFileNames.has(stem.toLowerCase())) {
    throw new Error(`Directory pack prompt titles must be unique after filename sanitization: ${title}`);
  }

  usedPromptFileNames.add(stem.toLowerCase());
  return stem;
}

function sanitizeDirectoryPromptFileStem(value: string) {
  const sanitized = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^-+|-+$/g, "");

  if (!sanitized) {
    throw new Error("Directory pack prompt title cannot be empty after filename sanitization.");
  }

  return sanitized;
}

function serializeDirectoryPromptBody(item: PromptItem) {
  return `<!-- promptbar:id=${item.id} -->\n${item.body.trim()}\n`;
}

function serializeDirectoryPackYaml(pack: PromptPack) {
  const metadata = pack.metadata;
  const lines = [
    `name: ${quoteYamlValue(pack.name)}`,
    `favorite: ${metadata.favorite ? "true" : "false"}`,
    `tags: [${metadata.tags.map(quoteYamlValue).join(", ")}]`,
    `aliases: [${metadata.aliases.map(quoteYamlValue).join(", ")}]`
  ];

  if (metadata.output && metadata.output !== "paste") {
    lines.push(`output: ${metadata.output}`);
  }

  if (metadata.outputFile) {
    lines.push(`outputFile: ${quoteYamlValue(metadata.outputFile)}`);
  }

  if (metadata.after?.type === "shell" && metadata.after.command) {
    lines.push("after: shell");
    lines.push(`command: ${quoteYamlValue(metadata.after.command)}`);
  }

  return `${lines.join("\n")}\n`;
}

function quoteYamlValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
