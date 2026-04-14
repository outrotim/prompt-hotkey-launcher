import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, "..");
const packageJsonPath = join(projectRoot, "package.json");
const releaseDirectory = join(projectRoot, "release");
const sourceAppPath = join(releaseDirectory, "mac-arm64", "PromptBar.app");
const baselineDirectory = join(releaseDirectory, "testing-baseline");
const baselineAppPath = join(baselineDirectory, "PromptBar.app");
const baselineManifestPath = join(baselineDirectory, "baseline.json");
const baselineReadmePath = join(baselineDirectory, "README.md");

if (!existsSync(sourceAppPath)) {
  throw new Error(`Packaged app not found at ${sourceAppPath}. Run "npm run dist:dir" first.`);
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const generatedAt = new Date().toISOString();

rmSync(baselineDirectory, { recursive: true, force: true });
mkdirSync(baselineDirectory, { recursive: true });
cpSync(sourceAppPath, baselineAppPath, { recursive: true });

const manifest = {
  name: packageJson.name,
  version: packageJson.version,
  generatedAt,
  sourceAppPath,
  baselineAppPath,
  baselineAppSizeBytes: getPathSize(baselineAppPath),
  checks: [
    "npm test",
    "npm run build",
    "npm run dist:dir"
  ],
  notes: [
    "This baseline is intended as the stable manual testing build.",
    "Replace it only after a fresh verification pass."
  ]
};

const manifestBody = JSON.stringify(manifest, null, 2);
const manifestHash = createHash("sha256").update(manifestBody).digest("hex");

writeFileSync(
  baselineManifestPath,
  `${JSON.stringify({ ...manifest, manifestSha256: manifestHash }, null, 2)}\n`
);

writeFileSync(
  baselineReadmePath,
  [
    "# PromptBar Testing Baseline",
    "",
    `- Generated at: ${generatedAt}`,
    `- Version: ${packageJson.version}`,
    `- App bundle: ${baselineAppPath}`,
    `- Manifest: ${baselineManifestPath}`,
    "",
    "This directory holds the current stable manual testing baseline.",
    "Refresh it with `npm run baseline:sync` after the app passes smoke verification again."
  ].join("\n")
);

console.log(`Testing baseline synced to ${baselineDirectory}`);

function getPathSize(targetPath) {
  const stats = lstatSync(targetPath);

  if (stats.isSymbolicLink()) {
    return 0;
  }

  if (!stats.isDirectory()) {
    return stats.size;
  }

  return readdirSync(targetPath).reduce(
    (total, entry) => total + getPathSize(join(targetPath, entry)),
    0
  );
}
