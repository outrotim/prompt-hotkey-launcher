import { execFileSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(rootDir, "resources", "promptbar-paste-helper.swift");
const outputPath = path.join(rootDir, "resources", "promptbar-paste-helper");

if (!existsSync(sourcePath)) {
  throw new Error(`Native paste helper source is missing: ${sourcePath}`);
}

const compileArgs = [
  "swiftc",
  "-O",
  "-framework",
  "ApplicationServices",
  sourcePath,
  "-o",
  outputPath
];

let lastError = null;

for (const command of ["xcrun", "swiftc"]) {
  try {
    const args = command === "xcrun" ? compileArgs : compileArgs.slice(1);
    execFileSync(command, args, {
      cwd: rootDir,
      stdio: "inherit"
    });
    chmodSync(outputPath, 0o755);
    console.log(`[build-paste-helper] built ${outputPath}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
  }
}

throw lastError ?? new Error("Unable to compile PromptBar native paste helper");
