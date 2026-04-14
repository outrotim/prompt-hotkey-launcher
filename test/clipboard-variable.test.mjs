import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runTypeScriptCheck(script) {
  return spawnSync(
    "node",
    ["--experimental-strip-types", "--experimental-specifier-resolution=node", "--input-type=module", "-e", script],
    { cwd, encoding: "utf8" }
  );
}

test("parser excludes {{clipboard}} from the extracted variables list", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parsePromptFile } from "./src/core/parser.ts";

const dir = mkdtempSync(join(tmpdir(), "promptbar-clip-"));
const filePath = join(dir, "test.md");
writeFileSync(filePath, [
  "---",
  "tags: []",
  "aliases: []",
  "favorite: false",
  "---",
  "",
  "# Pack",
  "",
  "## Prompt with clipboard",
  "Selected: {{clipboard}}",
  "Name: {{name}}",
  "Role: {{role|admin,user}}"
].join("\\n"));

const packs = parsePromptFile(filePath);
const prompt = packs[0].items[0];

// clipboard should NOT appear in the variables list
const variableKeys = prompt.variables.map(v => v.key);
assert.ok(!variableKeys.includes("clipboard"), "clipboard must not be in variables");
assert.ok(variableKeys.includes("name"), "name must be in variables");
assert.ok(variableKeys.includes("role"), "role must be in variables");
assert.equal(prompt.variables.length, 2);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("template renders {{clipboard}} with injected clipboard value", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { renderPromptBody } from "./src/core/template.ts";

const prompt = {
  id: "p1", packId: "pk1", title: "T",
  body: "You selected: {{clipboard}}\\nPlease {{action}} it.",
  description: "", favorite: false, tags: [], aliases: [],
  variables: [], sourceFile: "/tmp/t.md"
};

const rendered = renderPromptBody(prompt, {
  clipboard: "some copied text",
  action: "review"
});
assert.equal(rendered, "You selected: some copied text\\nPlease review it.");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("template uses fallback when clipboard value is not provided", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { renderPromptBody } from "./src/core/template.ts";

const prompt = {
  id: "p1", packId: "pk1", title: "T",
  body: "Content: {{clipboard|no selection}}",
  description: "", favorite: false, tags: [], aliases: [],
  variables: [], sourceFile: "/tmp/t.md"
};

// Without clipboard in values, should use fallback
const rendered = renderPromptBody(prompt, {});
assert.equal(rendered, "Content: no selection");

// With clipboard in values, should use the value
const renderedWithClip = renderPromptBody(prompt, { clipboard: "actual content" });
assert.equal(renderedWithClip, "Content: actual content");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("executePromptSelection injects clipboard text into variables", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

let capturedVariables = null;

await executePromptSelection({
  prompt: {
    id: "p1", packId: "pk1", title: "T",
    body: "{{clipboard}} {{name}}",
    description: "", favorite: false, tags: [], aliases: [],
    variables: [], sourceFile: "/tmp/t.md"
  },
  variables: { name: "Alice" },
  popupWindow: { isDestroyed: () => false },
  renderPromptBody: (_prompt, variables) => {
    capturedVariables = { ...variables };
    return "rendered";
  },
  pasteText: async () => {},
  recordUsage: () => {},
  hidePopupWindow: () => {},
  showPopupWindow: () => {},
  notifyPopupOpened: () => {},
  wait: async () => {},
  readClipboardText: () => "clipboard content here"
});

assert.equal(capturedVariables.clipboard, "clipboard content here");
assert.equal(capturedVariables.name, "Alice");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("user-provided variables override auto-injected clipboard", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

let capturedVariables = null;

await executePromptSelection({
  prompt: {
    id: "p1", packId: "pk1", title: "T",
    body: "{{clipboard}}",
    description: "", favorite: false, tags: [], aliases: [],
    variables: [], sourceFile: "/tmp/t.md"
  },
  variables: { clipboard: "user override" },
  popupWindow: { isDestroyed: () => false },
  renderPromptBody: (_prompt, variables) => {
    capturedVariables = { ...variables };
    return "rendered";
  },
  pasteText: async () => {},
  recordUsage: () => {},
  hidePopupWindow: () => {},
  showPopupWindow: () => {},
  notifyPopupOpened: () => {},
  wait: async () => {},
  readClipboardText: () => "auto clipboard"
});

assert.equal(capturedVariables.clipboard, "user override",
  "user-provided clipboard must override auto-injected value");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("executePromptSelection works without readClipboardText (backward compatible)", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

const result = await executePromptSelection({
  prompt: {
    id: "p1", packId: "pk1", title: "T",
    body: "Hello",
    description: "", favorite: false, tags: [], aliases: [],
    variables: [], sourceFile: "/tmp/t.md"
  },
  variables: {},
  popupWindow: { isDestroyed: () => false },
  renderPromptBody: () => "Hello",
  pasteText: async () => {},
  recordUsage: () => {},
  hidePopupWindow: () => {},
  showPopupWindow: () => {},
  notifyPopupOpened: () => {},
  wait: async () => {}
  // Note: no readClipboardText provided
});

assert.equal(result.ok, true);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
