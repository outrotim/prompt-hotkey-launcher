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
    {
      cwd,
      encoding: "utf8"
    }
  );
}

// ── assertPromptFilePath with malformed payloads (underlying IPC guard) ──
// Note: savePromptFile cannot be imported directly in strip-types mode due to
// .js extension imports in prompt-store.ts. We test the underlying guard
// (assertPromptFilePath) which is the actual security boundary.

test("assertPromptFilePath rejects non-string inputs without crashing", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-ipc-malform-"));
  const promptsDir = join(fixtureRoot, "prompts");
  mkdirSync(promptsDir, { recursive: true });

  try {
    const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { assertPromptFilePath } from "./src/main/prompt-path.ts";

const promptsDirectory = ${JSON.stringify(promptsDir)};

// number as path
assert.throws(
  () => assertPromptFilePath(promptsDirectory, 123),
  (err) => err instanceof Error || err instanceof TypeError,
  "numeric path must throw"
);

// undefined as path
assert.throws(
  () => assertPromptFilePath(promptsDirectory, undefined),
  (err) => err instanceof Error || err instanceof TypeError,
  "undefined path must throw"
);

// null as path
assert.throws(
  () => assertPromptFilePath(promptsDirectory, null),
  (err) => err instanceof Error || err instanceof TypeError,
  "null path must throw"
);
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("assertPromptFilePath rejects path traversal attempts", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-ipc-traversal-"));
  const promptsDir = join(fixtureRoot, "prompts");
  mkdirSync(promptsDir, { recursive: true });

  try {
    const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { assertPromptFilePath } from "./src/main/prompt-path.ts";

const promptsDirectory = ${JSON.stringify(promptsDir)};

assert.throws(
  () => assertPromptFilePath(promptsDirectory, ${JSON.stringify(join(promptsDir, "..", "..", "etc", "passwd.md"))}),
  /outside the prompts directory/,
  "path traversal must be rejected"
);
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("assertPromptFilePath rejects non-.md file extensions", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-ipc-ext-"));
  const promptsDir = join(fixtureRoot, "prompts");
  mkdirSync(promptsDir, { recursive: true });

  try {
    const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { assertPromptFilePath } from "./src/main/prompt-path.ts";

const promptsDirectory = ${JSON.stringify(promptsDir)};

assert.throws(
  () => assertPromptFilePath(promptsDirectory, ${JSON.stringify(join(promptsDir, "evil.txt"))}),
  /Markdown file/,
  "non-.md extension must be rejected"
);

assert.throws(
  () => assertPromptFilePath(promptsDirectory, ${JSON.stringify(join(promptsDir, "evil.js"))}),
  /Markdown file/,
  ".js extension must be rejected"
);
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

// ── assertPromptFilePath with malformed inputs ─────────────────────────

test("assertPromptFilePath handles empty string gracefully", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-ipc-empty-"));
  const promptsDir = join(fixtureRoot, "prompts");
  mkdirSync(promptsDir, { recursive: true });

  try {
    const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { assertPromptFilePath } from "./src/main/prompt-path.ts";

const promptsDirectory = ${JSON.stringify(promptsDir)};

// Empty string resolves to cwd, which is outside prompts dir
assert.throws(
  () => assertPromptFilePath(promptsDirectory, ""),
  (err) => err instanceof Error,
  "empty string path must throw"
);
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

// ── serializer with malformed packs ────────────────────────────────────

test("serializePromptFile handles empty packs array", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { serializePromptFile } from "./src/core/serializer.ts";

const output = serializePromptFile([]);
assert.equal(output, "", "empty packs must produce empty string");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("serializePromptFile handles pack with no items", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { serializePromptFile } from "./src/core/serializer.ts";

const output = serializePromptFile([{
  id: "pk1",
  name: "Empty Pack",
  sourceFile: "/tmp/test.md",
  metadata: { favorite: false, tags: [], aliases: [] },
  items: []
}]);

assert.ok(output.includes("# Empty Pack"), "output must contain the pack header");
assert.ok(output.includes("---"), "output must contain frontmatter");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

// ── template rendering with malformed inputs ───────────────────────────

test("renderPromptBody handles missing variable values gracefully", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { renderPromptBody } from "./src/core/template.ts";

const prompt = {
  id: "p1", packId: "pk1", title: "T",
  body: "Hello {{name}}, your role is {{role|admin,user}}",
  description: "", favorite: false, tags: [], aliases: [],
  variables: [], sourceFile: "/tmp/t.md"
};

// No values provided at all
const result1 = renderPromptBody(prompt, {});
assert.equal(result1, "Hello , your role is admin",
  "missing text variable = empty, missing enum = first option");

// Partial values
const result2 = renderPromptBody(prompt, { name: "Alice" });
assert.equal(result2, "Hello Alice, your role is admin");

// Explicit empty string should be kept
const result3 = renderPromptBody(prompt, { name: "", role: "" });
assert.equal(result3, "Hello , your role is ",
  "explicit empty string must not fall back to default");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("renderPromptBody handles body with no variables", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { renderPromptBody } from "./src/core/template.ts";

const prompt = {
  id: "p1", packId: "pk1", title: "T",
  body: "Plain text with no variables at all",
  description: "", favorite: false, tags: [], aliases: [],
  variables: [], sourceFile: "/tmp/t.md"
};

const result = renderPromptBody(prompt, { extraKey: "ignored" });
assert.equal(result, "Plain text with no variables at all",
  "body without variables must be returned unchanged");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

// ── executePromptSelection with edge-case prompt ───────────────────────

test("executePromptSelection handles empty body prompt", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

let pastedText = null;
const result = await executePromptSelection({
  prompt: {
    id: "p1", packId: "pk1", title: "Empty",
    body: "",
    description: "", favorite: false, tags: [], aliases: [],
    variables: [], sourceFile: "/tmp/t.md"
  },
  variables: {},
  popupWindow: { isDestroyed: () => false },
  renderPromptBody: (prompt) => prompt.body,
  pasteText: async (text) => { pastedText = text; },
  recordUsage: () => {},
  hidePopupWindow: () => {},
  showPopupWindow: () => {},
  notifyPopupOpened: () => {},
  wait: async () => {}
});

assert.equal(result.ok, true);
assert.equal(pastedText, "", "empty body must paste empty string without error");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

// ── settings update with invalid types ─────────────────────────────────

test("settings store updateSettings overwrites only provided keys", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-settings-partial-update-"));
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

// Update only locale
const updated = store.updateSettings({ locale: "zh-CN" });
assert.equal(updated.locale, "zh-CN");
assert.equal(updated.hotkey, DEFAULT_SETTINGS.hotkey, "untouched keys must keep defaults");
assert.equal(updated.launchAtLogin, DEFAULT_SETTINGS.launchAtLogin);

// Update with empty object (no-op)
const noopUpdate = store.updateSettings({});
assert.equal(noopUpdate.locale, "zh-CN", "previous update must persist");
assert.equal(noopUpdate.hotkey, DEFAULT_SETTINGS.hotkey);
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
