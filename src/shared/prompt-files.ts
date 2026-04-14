import { slugify } from "./slugify.js";

function normalizePath(value: string) {
  return value.replace(/\\/g, "/");
}

export function buildDraftPromptFilePath(
  baseDirectory: string,
  desiredName: string,
  existingSourceFiles: string[]
) {
  const normalizedBaseDirectory = normalizePath(baseDirectory).replace(/\/+$/g, "");
  const baseSlug = slugify(desiredName || "untitled");
  const existing = new Set(existingSourceFiles.map((filePath) => normalizePath(filePath).toLowerCase()));

  let suffix = 0;

  while (true) {
    const fileName = suffix === 0 ? `${baseSlug}.md` : `${baseSlug}-${suffix + 1}.md`;
    const candidate = `${normalizedBaseDirectory}/${fileName}`;

    if (!existing.has(candidate.toLowerCase())) {
      return candidate;
    }

    suffix += 1;
  }
}

export function resolveManagerDraftBaseDirectory(
  existingSourceFiles: string[],
  customPromptsDirectory: string
) {
  const normalizedCustomDirectory = normalizePath(customPromptsDirectory).replace(/\/+$/g, "");

  if (normalizedCustomDirectory) {
    return normalizedCustomDirectory;
  }

  const firstSourceFile = existingSourceFiles[0];

  if (!firstSourceFile) {
    return "";
  }

  const normalizedSourceFile = normalizePath(firstSourceFile);
  const slashIndex = normalizedSourceFile.lastIndexOf("/");

  if (slashIndex === -1) {
    return "";
  }

  return normalizedSourceFile.slice(0, slashIndex);
}
