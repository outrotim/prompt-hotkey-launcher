import { existsSync, lstatSync, realpathSync } from "node:fs";
import { basename, dirname, extname, resolve, sep } from "node:path";

export function assertPromptFilePath(promptsDirectory: string, candidatePath: string) {
  return assertPromptStoragePath(promptsDirectory, candidatePath, [".md"]);
}

export function assertDirectoryPackPath(promptsDirectory: string, candidatePath: string) {
  const resolvedPath = assertPromptStoragePath(promptsDirectory, candidatePath, [
    ".yaml",
    ".yml"
  ]);
  const fileName = basename(resolvedPath).toLowerCase();

  if (fileName !== "_pack.yaml" && fileName !== "_pack.yml") {
    throw new Error(`Directory pack path must point to _pack.yaml or _pack.yml: ${candidatePath}`);
  }

  return resolvedPath;
}

function assertPromptStoragePath(
  promptsDirectory: string,
  candidatePath: string,
  allowedExtensions: string[]
) {
  const rootPath = resolve(promptsDirectory);
  const rootRealPath = realpathSync(rootPath);
  const resolvedPath = resolve(candidatePath);
  const normalizedRoot = rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`;

  if (resolvedPath !== rootPath && !resolvedPath.startsWith(normalizedRoot)) {
    throw new Error(`Prompt file path is outside the prompts directory: ${candidatePath}`);
  }

  if (!allowedExtensions.includes(extname(resolvedPath).toLowerCase())) {
    throw new Error(
      `Prompt file path must point to one of ${allowedExtensions.join(", ")}: ${candidatePath}`
    );
  }

  const nearestExistingParentRealPath = resolveNearestExistingParentRealPath(resolvedPath);

  if (!isPathInsideRoot(rootRealPath, nearestExistingParentRealPath)) {
    throw new Error(`Prompt file path resolves outside the prompts directory: ${candidatePath}`);
  }

  if (existsSync(resolvedPath)) {
    if (lstatSync(resolvedPath).isSymbolicLink()) {
      throw new Error(`Prompt file path cannot be a symbolic link: ${candidatePath}`);
    }

    const resolvedRealPath = realpathSync(resolvedPath);

    if (!isPathInsideRoot(rootRealPath, resolvedRealPath)) {
      throw new Error(`Prompt file path resolves outside the prompts directory: ${candidatePath}`);
    }
  }

  return resolvedPath;
}

function resolveNearestExistingParentRealPath(candidatePath: string) {
  let currentPath = dirname(candidatePath);

  while (!existsSync(currentPath)) {
    const nextPath = dirname(currentPath);

    if (nextPath === currentPath) {
      throw new Error(`Prompt file path has no existing parent directory: ${candidatePath}`);
    }

    currentPath = nextPath;
  }

  return realpathSync(currentPath);
}

function isPathInsideRoot(rootPath: string, candidatePath: string) {
  const normalizedRoot = rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`;
  return candidatePath === rootPath || candidatePath.startsWith(normalizedRoot);
}
