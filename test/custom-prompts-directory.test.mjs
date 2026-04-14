import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runTypeScriptCheck(script) {
  return spawnSync(
    "node",
    ["--experimental-strip-types", "--experimental-specifier-resolution=node", "--input-type=module", "-e", script],
    { cwd, encoding: "utf8" }
  );
}

test("settings store includes customPromptsDirectory with empty string default", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-custom-dir-"));
  const settingsPath = join(fixtureRoot, "settings.json");

  try {
    const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { createSettingsStoreWithFileSystem, DEFAULT_SETTINGS } from "./src/main/settings.ts";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

const store = createSettingsStoreWithFileSystem(
  ${JSON.stringify(settingsPath)},
  { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync }
);

const settings = store.getSettings();
assert.equal(settings.customPromptsDirectory, "", "default should be empty string");
assert.equal(DEFAULT_SETTINGS.customPromptsDirectory, "");
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("settings store persists and reads back customPromptsDirectory", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-custom-dir-"));
  const settingsPath = join(fixtureRoot, "settings.json");

  try {
    const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { createSettingsStoreWithFileSystem } from "./src/main/settings.ts";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

const store = createSettingsStoreWithFileSystem(
  ${JSON.stringify(settingsPath)},
  { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync }
);

const updated = store.updateSettings({ customPromptsDirectory: "/tmp/my-prompts" });
assert.equal(updated.customPromptsDirectory, "/tmp/my-prompts");

// Invalidate cache and re-read from disk
store.invalidate();
const reloaded = store.getSettings();
assert.equal(reloaded.customPromptsDirectory, "/tmp/my-prompts",
  "customPromptsDirectory must survive write-invalidate-read cycle");
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("settings store resets customPromptsDirectory to empty string", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-custom-dir-"));
  const settingsPath = join(fixtureRoot, "settings.json");

  try {
    const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { createSettingsStoreWithFileSystem } from "./src/main/settings.ts";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

const store = createSettingsStoreWithFileSystem(
  ${JSON.stringify(settingsPath)},
  { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync }
);

store.updateSettings({ customPromptsDirectory: "/tmp/custom" });
const reset = store.updateSettings({ customPromptsDirectory: "" });
assert.equal(reset.customPromptsDirectory, "", "reset to empty must work");
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

// resolvePromptsDirectory depends on electron (app.getPath), so we test its
// core logic inline: valid dir → use it, otherwise fallback.
test("resolvePromptsDirectory logic: valid directory is accepted", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-resolve-dir-"));
  const customDir = join(fixtureRoot, "my-prompts");
  mkdirSync(customDir, { recursive: true });

  try {
    const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";

// Replicate resolvePromptsDirectory core logic without electron dependency
function resolvePromptsDirectoryLogic(customPath, fallback) {
  if (customPath && existsSync(customPath) && statSync(customPath).isDirectory()) {
    return customPath;
  }
  return fallback;
}

const customDir = ${JSON.stringify(customDir)};
const fallback = "/default/prompts";

assert.equal(resolvePromptsDirectoryLogic(customDir, fallback), customDir,
  "valid custom directory must be returned as-is");
assert.equal(resolvePromptsDirectoryLogic("", fallback), fallback,
  "empty string must fallback");
assert.equal(resolvePromptsDirectoryLogic("/nonexistent/path", fallback), fallback,
  "nonexistent path must fallback");
assert.equal(resolvePromptsDirectoryLogic(null, fallback), fallback,
  "null must fallback");
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("manager can derive a draft file base directory from an empty custom prompts directory", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-manager-base-dir-"));
  const customDir = join(fixtureRoot, "custom-prompts");
  mkdirSync(customDir, { recursive: true });

  try {
    const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { resolveManagerDraftBaseDirectory } from "./src/shared/prompt-files.ts";

assert.equal(
  resolveManagerDraftBaseDirectory([], ${JSON.stringify(customDir)}),
  ${JSON.stringify(customDir)},
  "empty custom prompts directory should be used as the base path"
);
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
