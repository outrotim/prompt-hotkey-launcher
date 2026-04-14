import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readFile as readFileAsync, readdir as readdirAsync } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type {
  PromptFileMetadata,
  PromptItem,
  PromptLibrary,
  PromptPack,
  PromptVariable
} from "../shared/types";
import { slugify } from "../shared/slugify.js";

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?/;
const PROMPT_ID_PATTERN = /^<!--\s*promptbar:id=(.+?)\s*-->$/;
const VARIABLE_PATTERN = /{{\s*([^}]+?)\s*}}/g;
const PARSER_RESERVED_VARIABLE_KEYS = ["clipboard", "today", "yesterday", "tomorrow", "now"];
const PARSER_VALID_OUTPUT_MODES: readonly string[] = ["paste", "clipboard", "file"];
const PARSER_VALID_AFTER_TYPES: readonly string[] = ["shell"];

export function loadPromptLibrary(promptsDirectory: string): PromptLibrary {
  const directory = resolve(promptsDirectory);
  const markdownFiles = collectMarkdownFiles(directory);
  const directoryPacks = collectDirectoryPacks(directory);

  const packs = [
    ...markdownFiles.flatMap((fileName) =>
      parsePromptFile(join(directory, fileName))
    ),
    ...directoryPacks
  ];

  return {
    packs,
    items: packs.flatMap((pack) => pack.items)
  };
}

export async function loadPromptLibraryAsync(
  promptsDirectory: string
): Promise<PromptLibrary> {
  const directory = resolve(promptsDirectory);
  const markdownFiles = await collectMarkdownFilesAsync(directory);
  const directoryPacks = collectDirectoryPacks(directory);
  const parsedPackGroups = await Promise.all(
    markdownFiles.map((fileName) => parsePromptFileAsync(join(directory, fileName)))
  );
  const packs = [...parsedPackGroups.flat(), ...directoryPacks];

  return {
    packs,
    items: packs.flatMap((pack) => pack.items)
  };
}

export function parsePromptFile(filePath: string): PromptPack[] {
  const raw = readFileSync(filePath, "utf8");
  return parsePromptFileContent(raw, filePath);
}

async function parsePromptFileAsync(filePath: string): Promise<PromptPack[]> {
  const raw = await readFileAsync(filePath, "utf8");
  return parsePromptFileContent(raw, filePath);
}

function parsePromptFileContent(raw: string, filePath: string): PromptPack[] {
  const { metadata, content } = extractFrontmatter(raw);
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const packs: PromptPack[] = [];

  let currentPack: PromptPack | null = null;
  let currentPromptTitle: string | null = null;
  let currentPromptLines: string[] = [];
  let pendingPromptId: string | null = null;
  const promptIdCounts = new Map<string, number>();

  const flushPrompt = () => {
    if (!currentPack || !currentPromptTitle) {
      return;
    }

    const body = currentPromptLines.join("\n").trim();
    const variables = extractVariables(body);
    const basePromptId =
      pendingPromptId ?? `${currentPack.id}:${slugify(currentPromptTitle)}`;
    const promptId = ensureUniquePromptId(basePromptId, promptIdCounts);

    const item: PromptItem = {
      id: promptId,
      packId: currentPack.id,
      title: currentPromptTitle,
      body,
      description: buildDescription(body),
      favorite: metadata.favorite,
      tags: metadata.tags,
      aliases: metadata.aliases,
      variables,
      sourceFile: filePath,
      ...(metadata.output ? { output: metadata.output } : {}),
      ...(metadata.outputFile ? { outputFile: metadata.outputFile } : {}),
      ...(metadata.after ? { after: metadata.after } : {})
    };

    currentPack.items.push(item);
    currentPromptTitle = null;
    currentPromptLines = [];
    pendingPromptId = null;
  };

  const flushPack = () => {
    flushPrompt();

    if (currentPack) {
      packs.push(currentPack);
      currentPack = null;
    }
  };

  for (const line of lines) {
    if (line.startsWith("# ")) {
      flushPack();
      const packName = line.slice(2).trim();
      currentPack = {
        id: slugify(`${basename(filePath, ".md")}-${packName}`),
        name: packName,
        sourceFile: filePath,
        metadata,
        items: []
      };
      continue;
    }

    if (line.startsWith("## ")) {
      flushPrompt();

      if (!currentPack) {
        currentPack = {
          id: slugify(basename(filePath, ".md")),
          name: basename(filePath, ".md"),
          sourceFile: filePath,
          metadata,
          items: []
        };
      }

      currentPromptTitle = line.slice(3).trim();
      currentPromptLines = [];
      continue;
    }

    const promptIdMatch = line.trim().match(PROMPT_ID_PATTERN);

    if (promptIdMatch?.[1]) {
      if (currentPromptTitle) {
        flushPrompt();
      }

      pendingPromptId = promptIdMatch[1].trim();
      continue;
    }

    if (currentPromptTitle) {
      currentPromptLines.push(line);
    }
  }

  flushPack();
  return packs.filter((pack) => pack.items.length > 0);
}

function isDirectoryPack(directoryPath: string): boolean {
  return existsSync(join(directoryPath, "_pack.yaml")) || existsSync(join(directoryPath, "_pack.yml"));
}

function collectDirectoryPacks(rootDirectory: string): PromptPack[] {
  const entries = readdirSync(rootDirectory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name)
  );

  const packs: PromptPack[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const dirPath = join(rootDirectory, entry.name);

    if (!isDirectoryPack(dirPath)) {
      continue;
    }

    const packId = slugify(entry.name);
    const packYamlPath = existsSync(join(dirPath, "_pack.yaml"))
      ? join(dirPath, "_pack.yaml")
      : join(dirPath, "_pack.yml");
    const packYaml = readFileSync(packYamlPath, "utf8");
    const parsedName = parseSimpleYamlValue(packYaml, "name");
    const packName = parsedName !== null ? parsedName : entry.name;
    const metadata = parseDirectoryPackMetadata(packYaml);

    const mdFiles = readdirSync(dirPath, { withFileTypes: true })
      .filter((e) => e.isFile() && extname(e.name).toLowerCase() === ".md")
      .sort((a, b) => a.name.localeCompare(b.name));

    const items: PromptItem[] = mdFiles.map((mdEntry) => {
      const mdPath = join(dirPath, mdEntry.name);
      const content = readFileSync(mdPath, "utf8");
      const title = basename(mdEntry.name, ".md");
      const normalizedContent = content.replace(FRONTMATTER_PATTERN, "").replace(/\r\n/g, "\n");
      const persistedPromptId = extractPersistedPromptId(normalizedContent);
      const body = removePersistedPromptId(normalizedContent).trim();
      const variables = extractVariables(body);

      return {
        id: persistedPromptId ?? `${packId}:${slugify(title)}`,
        packId,
        title,
        body,
        description: buildDescription(body),
        favorite: metadata.favorite,
        tags: metadata.tags,
        aliases: metadata.aliases,
        variables,
        sourceFile: mdPath,
        ...(metadata.output ? { output: metadata.output } : {}),
        ...(metadata.outputFile ? { outputFile: metadata.outputFile } : {}),
        ...(metadata.after ? { after: metadata.after } : {})
      };
    });

    if (items.length > 0) {
      packs.push({
        id: packId,
        name: packName,
        sourceFile: packYamlPath,
        metadata,
        items
      });
    }
  }

  return packs;
}

function parseSimpleYamlValue(yaml: string, key: string): string | null {
  for (const line of yaml.split("\n")) {
    const idx = line.indexOf(":");

    if (idx === -1) {
      continue;
    }

    if (line.slice(0, idx).trim() === key) {
      return line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    }
  }

  return null;
}

function parseDirectoryPackMetadata(yaml: string): PromptFileMetadata {
  const metadata: PromptFileMetadata = {
    favorite: false,
    tags: [],
    aliases: []
  };

  const tags = parseSimpleYamlValue(yaml, "tags");

  if (tags !== null) {
    const inner = tags.replace(/^\[/, "").replace(/\]$/, "").trim();
    metadata.tags = inner ? parseQuotedCsvValues(inner) : [];
  }

  const aliases = parseSimpleYamlValue(yaml, "aliases");

  if (aliases !== null) {
    const inner = aliases.replace(/^\[/, "").replace(/\]$/, "").trim();
    metadata.aliases = inner ? parseQuotedCsvValues(inner) : [];
  }

  const favorite = parseSimpleYamlValue(yaml, "favorite");

  if (favorite === "true") {
    metadata.favorite = true;
  }

  const output = parseSimpleYamlValue(yaml, "output");

  if (output && PARSER_VALID_OUTPUT_MODES.includes(output)) {
    metadata.output = output as PromptFileMetadata["output"];
  }

  const outputFile = parseSimpleYamlValue(yaml, "outputFile");

  if (outputFile) {
    metadata.outputFile = outputFile;
  }

  const after = parseSimpleYamlValue(yaml, "after");
  const command = parseSimpleYamlValue(yaml, "command");

  if (after && PARSER_VALID_AFTER_TYPES.includes(after) && command) {
    metadata.after = { type: "shell", command };
  }

  return metadata;
}

function collectMarkdownFiles(directory: string, rootDirectory = directory): string[] {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name)
  );

  const markdownFiles: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (isDirectoryPack(absolutePath)) {
        continue;
      }

      markdownFiles.push(...collectMarkdownFiles(absolutePath, rootDirectory));
      continue;
    }

    if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      markdownFiles.push(absolutePath.slice(rootDirectory.length + 1));
    }
  }

  return markdownFiles;
}

async function collectMarkdownFilesAsync(
  directory: string,
  rootDirectory = directory
): Promise<string[]> {
  const entries = (
    await readdirAsync(directory, { withFileTypes: true })
  ).sort((left, right) => left.name.localeCompare(right.name));

  const markdownFiles: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (isDirectoryPack(absolutePath)) {
        continue;
      }

      markdownFiles.push(
        ...(await collectMarkdownFilesAsync(absolutePath, rootDirectory))
      );
      continue;
    }

    if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      markdownFiles.push(absolutePath.slice(rootDirectory.length + 1));
    }
  }

  return markdownFiles;
}

function ensureUniquePromptId(basePromptId: string, promptIdCounts: Map<string, number>) {
  const nextCount = (promptIdCounts.get(basePromptId) ?? 0) + 1;
  promptIdCounts.set(basePromptId, nextCount);

  return nextCount === 1 ? basePromptId : `${basePromptId}-${nextCount}`;
}

function extractFrontmatter(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(FRONTMATTER_PATTERN);

  if (!match) {
    return {
      metadata: {
        favorite: false,
        tags: [],
        aliases: []
      },
      content: normalized
    };
  }

  const metadata = parseFrontmatterBlock(match[1]);
  const body = normalized.slice(match[0].length);

  return {
    metadata,
    content: body
  };
}

function parseFrontmatterBlock(block: string): PromptFileMetadata {
  const metadata: PromptFileMetadata = {
    favorite: false,
    tags: [],
    aliases: []
  };

  for (const line of block.split("\n")) {
    const separatorIndex = line.indexOf(":");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();

    if (key === "favorite") {
      metadata.favorite = rawValue === "true";
      continue;
    }

    if (key === "tags" || key === "aliases") {
      const inner = rawValue.replace(/^\[/, "").replace(/\]$/, "").trim();
      metadata[key] = inner ? parseQuotedCsvValues(inner) : [];
      continue;
    }

    if (key === "output" && PARSER_VALID_OUTPUT_MODES.includes(rawValue)) {
      metadata.output = rawValue as PromptFileMetadata["output"];
      continue;
    }

    if (key === "outputFile") {
      metadata.outputFile = rawValue.replace(/^["']|["']$/g, "");
      continue;
    }

    if (key === "after" && PARSER_VALID_AFTER_TYPES.includes(rawValue)) {
      metadata.after = { type: "shell", command: "" };
      continue;
    }

    if (key === "command" && metadata.after?.type === "shell") {
      metadata.after.command = rawValue.replace(/^["']|["']$/g, "");
    }
  }

  return metadata;
}

function extractVariables(body: string): PromptVariable[] {
  const variables = new Map<string, PromptVariable>();

  for (const match of body.matchAll(VARIABLE_PATTERN)) {
    const rawExpression = match[1]?.trim();

    if (!rawExpression) {
      continue;
    }

    const [keyPart, optionsPart] = rawExpression.split("|");
    const key = keyPart?.trim();

    if (!key || key.startsWith("@") || variables.has(key) || PARSER_RESERVED_VARIABLE_KEYS.includes(key)) {
      continue;
    }

    const options = optionsPart
      ? optionsPart
          .split(",")
          .map((option) => option.trim())
          .filter(Boolean)
      : [];

    variables.set(key, {
      key,
      kind: options.length > 0 ? "enum" : "text",
      required: true,
      options,
      defaultValue: options[0]
    });
  }

  return [...variables.values()];
}

function buildDescription(body: string) {
  const firstLine = body
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return "No preview available.";
  }

  return firstLine.length > 96 ? `${firstLine.slice(0, 93)}...` : firstLine;
}

function extractPersistedPromptId(content: string) {
  for (const line of content.split("\n")) {
    const promptIdMatch = line.trim().match(PROMPT_ID_PATTERN);

    if (promptIdMatch?.[1]) {
      return promptIdMatch[1].trim();
    }
  }

  return null;
}

function removePersistedPromptId(content: string) {
  return content
    .split("\n")
    .filter((line) => !PROMPT_ID_PATTERN.test(line.trim()))
    .join("\n");
}

/**
 * Parse a CSV-like string that respects double-quoted values.
 * Handles escaped quotes (\") and commas inside quotes.
 * Unquoted values are trimmed; empty tokens are dropped.
 */
function parseQuotedCsvValues(input: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (inQuotes) {
      if (char === "\\" && i + 1 < input.length && input[i + 1] === '"') {
        current += '"';
        i += 2;
        continue;
      }

      if (char === '"') {
        inQuotes = false;
        i += 1;
        continue;
      }

      current += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (char === ",") {
      const trimmed = current.trim();

      if (trimmed) {
        values.push(trimmed);
      }

      current = "";
      i += 1;
      continue;
    }

    current += char;
    i += 1;
  }

  const trimmed = current.trim();

  if (trimmed) {
    values.push(trimmed);
  }

  return values;
}
