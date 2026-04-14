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
    {
      cwd,
      encoding: "utf8"
    }
  );
}

// ── resolvePopupKeyboardAction with variable field target ──────────────

test("variable field: Enter key is noop (not confirm) when variable field is focused", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { resolvePopupKeyboardAction } from "./src/renderer/src/popup-navigation.ts";
import { shouldUsePrimaryConfirmShortcut } from "./src/renderer/src/prompt-helpers.ts";

const variableFieldTarget = { dataset: { promptbarVariableField: "true" } };
const prompt = {
  id: "p1", packId: "pk1", title: "T", body: "", description: "",
  favorite: false, tags: [], aliases: [], variables: [{ key: "name", kind: "text", required: true, options: [] }]
};

const action = resolvePopupKeyboardAction({
  eventKey: "Enter",
  target: variableFieldTarget,
  query: "",
  isSubmitting: false,
  currentPackId: "pk1",
  selectedIndex: 0,
  selectedPrompt: prompt,
  visiblePrompts: [prompt],
  visiblePacks: [{ id: "pk1" }],
  shouldUsePrimaryConfirmShortcut
});

assert.deepEqual(action, { type: "noop" },
  "Enter must be noop when variable field is focused");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("variable field: number keys 1-9 are noop when variable field is focused", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { resolvePopupKeyboardAction } from "./src/renderer/src/popup-navigation.ts";
import { shouldUsePrimaryConfirmShortcut } from "./src/renderer/src/prompt-helpers.ts";

const variableFieldTarget = { dataset: { promptbarVariableField: "true" } };
const prompt = {
  id: "p1", packId: "pk1", title: "T", body: "", description: "",
  favorite: false, tags: [], aliases: [], variables: []
};

for (const key of ["1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
  const action = resolvePopupKeyboardAction({
    eventKey: key,
    target: variableFieldTarget,
    query: "",
    isSubmitting: false,
    currentPackId: "pk1",
    selectedIndex: 0,
    selectedPrompt: prompt,
    visiblePrompts: [prompt],
    visiblePacks: [{ id: "pk1" }],
    shouldUsePrimaryConfirmShortcut
  });

  assert.deepEqual(action, { type: "noop" },
    "number key " + key + " must be noop when variable field is focused");
}
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("variable field: arrow keys are noop when variable field is focused", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { resolvePopupKeyboardAction } from "./src/renderer/src/popup-navigation.ts";
import { shouldUsePrimaryConfirmShortcut } from "./src/renderer/src/prompt-helpers.ts";

const variableFieldTarget = { dataset: { promptbarVariableField: "true" } };
const prompt = {
  id: "p1", packId: "pk1", title: "T", body: "", description: "",
  favorite: false, tags: [], aliases: [], variables: []
};

for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
  const action = resolvePopupKeyboardAction({
    eventKey: key,
    target: variableFieldTarget,
    query: "",
    isSubmitting: false,
    currentPackId: "pk1",
    selectedIndex: 0,
    selectedPrompt: prompt,
    visiblePrompts: [prompt],
    visiblePacks: [{ id: "pk1" }],
    shouldUsePrimaryConfirmShortcut
  });

  assert.deepEqual(action, { type: "noop" },
    key + " must be noop when variable field is focused");
}
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("variable field: Escape still works to close popup even when variable field is focused", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { resolvePopupKeyboardAction } from "./src/renderer/src/popup-navigation.ts";
import { shouldUsePrimaryConfirmShortcut } from "./src/renderer/src/prompt-helpers.ts";

const variableFieldTarget = { dataset: { promptbarVariableField: "true" } };
const prompt = {
  id: "p1", packId: "pk1", title: "T", body: "", description: "",
  favorite: false, tags: [], aliases: [], variables: []
};

const action = resolvePopupKeyboardAction({
  eventKey: "Escape",
  target: variableFieldTarget,
  query: "",
  isSubmitting: false,
  currentPackId: "pk1",
  selectedIndex: 0,
  selectedPrompt: prompt,
  visiblePrompts: [prompt],
  visiblePacks: [{ id: "pk1" }],
  shouldUsePrimaryConfirmShortcut
});

assert.deepEqual(action, { type: "escape" },
  "Escape must still close popup even when variable field is focused");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("without variable field: Enter confirms selection normally", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { resolvePopupKeyboardAction } from "./src/renderer/src/popup-navigation.ts";
import { shouldUsePrimaryConfirmShortcut } from "./src/renderer/src/prompt-helpers.ts";

const noFieldTarget = null;
const prompt = {
  id: "p1", packId: "pk1", title: "T", body: "", description: "",
  favorite: false, tags: [], aliases: [], variables: []
};

const action = resolvePopupKeyboardAction({
  eventKey: "Enter",
  target: noFieldTarget,
  query: "",
  isSubmitting: false,
  currentPackId: "pk1",
  selectedIndex: 0,
  selectedPrompt: prompt,
  visiblePrompts: [prompt],
  visiblePacks: [{ id: "pk1" }],
  shouldUsePrimaryConfirmShortcut
});

assert.deepEqual(action, { type: "confirm", prompt, index: 0 },
  "Enter must confirm when no variable field is focused");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("shouldUsePrimaryConfirmShortcut: '1' key confirms when prompt has variables", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { shouldUsePrimaryConfirmShortcut } from "./src/renderer/src/prompt-helpers.ts";

// "1" with empty query and variables → confirm
assert.equal(
  shouldUsePrimaryConfirmShortcut("1", "", { variables: [{ key: "name" }] }),
  true,
  "'1' should confirm when prompt has variables"
);

// "1" with empty query and no variables → quick-select (not confirm via this function)
assert.equal(
  shouldUsePrimaryConfirmShortcut("1", "", { variables: [] }),
  false,
  "'1' should not use primary confirm when no variables and empty query"
);

// "1" with non-empty query → confirm
assert.equal(
  shouldUsePrimaryConfirmShortcut("1", "keyword", { variables: [] }),
  true,
  "'1' should confirm when searching"
);

// "Enter" always confirms
assert.equal(
  shouldUsePrimaryConfirmShortcut("Enter", "", null),
  true,
  "Enter should always confirm"
);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
