import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runTypeScriptCheck(script) {
  return spawnSync(
    "node",
    ["--experimental-strip-types", "--experimental-specifier-resolution=node", "--input-type=module", "-e", script],
    {
      cwd,
      encoding: "utf8"
    }
  );
}

test("settings store falls back to defaults when file contains invalid JSON", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-settings-corrupt-"));
  const settingsPath = join(fixtureRoot, "settings.json");
  writeFileSync(settingsPath, "NOT VALID JSON {{{");

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
assert.deepEqual(settings, DEFAULT_SETTINGS,
  "corrupted JSON file must fall back to DEFAULT_SETTINGS");
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("settings store falls back to defaults when file contains empty string", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-settings-empty-"));
  const settingsPath = join(fixtureRoot, "settings.json");
  writeFileSync(settingsPath, "");

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
assert.deepEqual(settings, DEFAULT_SETTINGS,
  "empty file must fall back to DEFAULT_SETTINGS");
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("settings store falls back to defaults when file does not exist", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-settings-missing-"));
  const settingsPath = join(fixtureRoot, "nonexistent", "settings.json");

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
assert.deepEqual(settings, DEFAULT_SETTINGS,
  "missing file must fall back to DEFAULT_SETTINGS");
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("settings store merges partial JSON with defaults for missing keys", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-settings-partial-"));
  const settingsPath = join(fixtureRoot, "settings.json");
  writeFileSync(settingsPath, JSON.stringify({ hotkey: "Alt+Space" }));

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
assert.equal(settings.hotkey, "Alt+Space", "provided key must override default");
assert.equal(settings.launchAtLogin, DEFAULT_SETTINGS.launchAtLogin, "missing key must use default");
assert.equal(settings.locale, DEFAULT_SETTINGS.locale, "missing locale must use default");
assert.deepEqual(settings.packOrder, DEFAULT_SETTINGS.packOrder, "missing packOrder must use default");
assert.deepEqual(settings.promptOrder, DEFAULT_SETTINGS.promptOrder, "missing promptOrder must use default");
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("settings store can recover after reading corrupted file by writing new valid settings", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-settings-recover-"));
  const settingsPath = join(fixtureRoot, "settings.json");
  writeFileSync(settingsPath, "BROKEN");

  try {
    const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { createSettingsStoreWithFileSystem, DEFAULT_SETTINGS } from "./src/main/settings.ts";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

const store = createSettingsStoreWithFileSystem(
  ${JSON.stringify(settingsPath)},
  { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync }
);

// First read falls back to defaults
const initial = store.getSettings();
assert.deepEqual(initial, DEFAULT_SETTINGS);

// Update should write valid JSON
const updated = store.updateSettings({ hotkey: "Control+Shift+P", locale: "zh-CN" });
assert.equal(updated.hotkey, "Control+Shift+P");
assert.equal(updated.locale, "zh-CN");

// Read the file directly to verify it's now valid JSON
const raw = readFileSync(${JSON.stringify(settingsPath)}, "utf8");
const parsed = JSON.parse(raw);
assert.equal(parsed.hotkey, "Control+Shift+P");
assert.equal(parsed.locale, "zh-CN");
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("history store falls back to empty records when file contains invalid JSON", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-history-corrupt-"));
  const historyPath = join(fixtureRoot, "history.json");
  writeFileSync(historyPath, "{not valid json!!!}");

  try {
    const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { createHistoryStoreWithFileSystem } from "./src/main/history.ts";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

const store = createHistoryStoreWithFileSystem(
  ${JSON.stringify(historyPath)},
  { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync }
);

const items = [{
  id: "prompt-1", packId: "pack-1", title: "T", body: "", description: "",
  favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/tmp/t.md"
}];

const annotated = store.annotatePrompts(items);
assert.equal(annotated[0].useCount, 0, "corrupted history must result in zero usage");
assert.equal(annotated[0].lastUsedAt, undefined, "corrupted history must have no lastUsedAt");

store.dispose();
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
