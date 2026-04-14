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

// ── getNextSelectedIndex ──────────────────────────────────────────────────

test("ArrowDown from index 0 in a 5-item list moves to index 1", () => {
  const script = `
import assert from "node:assert/strict";
import { getNextSelectedIndex } from "./src/renderer/src/popup-navigation.ts";
assert.equal(getNextSelectedIndex(0, "down", 5), 1);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("ArrowDown clamps at the last item", () => {
  const script = `
import assert from "node:assert/strict";
import { getNextSelectedIndex } from "./src/renderer/src/popup-navigation.ts";
assert.equal(getNextSelectedIndex(4, "down", 5), 4);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("ArrowUp from index 3 moves to index 2", () => {
  const script = `
import assert from "node:assert/strict";
import { getNextSelectedIndex } from "./src/renderer/src/popup-navigation.ts";
assert.equal(getNextSelectedIndex(3, "up", 5), 2);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("ArrowUp clamps at 0", () => {
  const script = `
import assert from "node:assert/strict";
import { getNextSelectedIndex } from "./src/renderer/src/popup-navigation.ts";
assert.equal(getNextSelectedIndex(0, "up", 5), 0);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("ArrowDown in an empty list returns 0", () => {
  const script = `
import assert from "node:assert/strict";
import { getNextSelectedIndex } from "./src/renderer/src/popup-navigation.ts";
assert.equal(getNextSelectedIndex(0, "down", 0), 0);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("ArrowDown in a single-item list stays at 0", () => {
  const script = `
import assert from "node:assert/strict";
import { getNextSelectedIndex } from "./src/renderer/src/popup-navigation.ts";
assert.equal(getNextSelectedIndex(0, "down", 1), 0);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

// ── getVisiblePrompts ─────────────────────────────────────────────────────

test("empty query returns pack items sorted, not all prompts", () => {
  const script = `
import assert from "node:assert/strict";
import { getVisiblePrompts } from "./src/renderer/src/popup-navigation.ts";
const makeItem = (o) => ({ title: "", description: "", body: "", packId: "p", aliases: [], tags: [], favorite: false, ...o });
const all = [makeItem({ title: "A" }), makeItem({ title: "B" }), makeItem({ title: "C" })];
const pack = [all[0], all[1]];
const result = getVisiblePrompts(all, pack, "");
assert.equal(result.length, 2);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("query filters across title, tags, and aliases", () => {
  const script = `
import assert from "node:assert/strict";
import { getVisiblePrompts } from "./src/renderer/src/popup-navigation.ts";
const makeItem = (o) => ({ title: "", description: "", body: "", packId: "p", aliases: [], tags: [], favorite: false, ...o });
const all = [
  makeItem({ title: "Deploy script" }),
  makeItem({ title: "Other", tags: ["deploy"] }),
  makeItem({ title: "Unrelated" })
];
const result = getVisiblePrompts(all, [], "deploy");
assert.equal(result.length, 2);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("query is case-insensitive", () => {
  const script = `
import assert from "node:assert/strict";
import { getVisiblePrompts } from "./src/renderer/src/popup-navigation.ts";
const makeItem = (o) => ({ title: "", description: "", body: "", packId: "p", aliases: [], tags: [], favorite: false, ...o });
const all = [makeItem({ title: "Hello World" })];
const result = getVisiblePrompts(all, [], "hello");
assert.equal(result.length, 1);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("query can match the displayed pack name after a pack rename", () => {
  const script = `
import assert from "node:assert/strict";
import { getVisiblePrompts } from "./src/renderer/src/popup-navigation.ts";
const all = [
  {
    id: "prompt-1",
    title: "Main prompt",
    description: "",
    body: "",
    packId: "legacy-pack-id",
    packName: "新的研究画像",
    aliases: [],
    tags: [],
    favorite: false
  }
];
const result = getVisiblePrompts(all, [], "研究画像");
assert.equal(result.length, 1);
assert.equal(result[0].id, "prompt-1");
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("popup list state keeps every visible prompt available for navigation", () => {
  const script = `
import assert from "node:assert/strict";
import { getPopupListState } from "./src/renderer/src/popup-navigation.ts";
const items = Array.from({ length: 20 }, (_, i) => ({
  id: "prompt-" + i,
  title: "Item " + i, description: "", body: "", packId: "p",
  aliases: [], tags: [], favorite: false
}));
const result = getPopupListState(items, items, "", 19);
assert.equal(result.visiblePrompts.length, 20, "all 20 items must stay visible");
assert.equal(result.selectedIndex, 19, "the last item should remain reachable");
assert.equal(result.selectedPrompt?.id, result.visiblePrompts[19]?.id ?? null);
assert.equal(result.visiblePrompts.some((prompt) => prompt.id === "prompt-19"), true);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

// ── sortPromptItems ───────────────────────────────────────────────────────

test("favorites sort before non-favorites", () => {
  const script = `
import assert from "node:assert/strict";
import { sortPromptItems } from "./src/renderer/src/popup-navigation.ts";
const items = [
  { title: "B", description: "", body: "", packId: "p", aliases: [], tags: [], favorite: false },
  { title: "A", description: "", body: "", packId: "p", aliases: [], tags: [], favorite: true }
];
const sorted = sortPromptItems(items);
assert.equal(sorted[0].title, "A");
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("higher useCount sorts first", () => {
  const script = `
import assert from "node:assert/strict";
import { sortPromptItems } from "./src/renderer/src/popup-navigation.ts";
const items = [
  { title: "Low", description: "", body: "", packId: "p", aliases: [], tags: [], favorite: false, useCount: 1 },
  { title: "High", description: "", body: "", packId: "p", aliases: [], tags: [], favorite: false, useCount: 10 }
];
const sorted = sortPromptItems(items);
assert.equal(sorted[0].title, "High");
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("manual prompt order overrides favorites and recent usage in both pack and search modes", () => {
  const script = `
import assert from "node:assert/strict";
import {
  getVisiblePrompts,
  sortPromptItems
} from "./src/renderer/src/popup-navigation.ts";

const items = [
  { id: "prompt-1", title: "Alpha", description: "", body: "", packId: "pack-a", aliases: [], tags: [], favorite: true, useCount: 9, lastUsedAt: "2026-03-20T10:00:00.000Z" },
  { id: "prompt-2", title: "Beta", description: "", body: "", packId: "pack-a", aliases: [], tags: [], favorite: false, useCount: 0, lastUsedAt: "" },
  { id: "prompt-3", title: "Gamma", description: "", body: "", packId: "pack-b", aliases: [], tags: [], favorite: false, useCount: 1, lastUsedAt: "2026-03-19T10:00:00.000Z" }
];

const manualOrder = ["prompt-3", "prompt-2", "prompt-1"];

assert.deepEqual(
  sortPromptItems(items, manualOrder).map((item) => item.id),
  manualOrder
);

assert.deepEqual(
  getVisiblePrompts(items, items.filter((item) => item.packId === "pack-a"), "", manualOrder).map((item) => item.id),
  ["prompt-2", "prompt-1"]
);

assert.deepEqual(
  getVisiblePrompts(items, items.filter((item) => item.packId === "pack-a"), "a", manualOrder).map((item) => item.id),
  manualOrder
);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("popup prompt drag reordering can round-trip through persisted prompt order", () => {
  const script = `
import assert from "node:assert/strict";
import {
  buildPromptOrderFromReplacement,
  reorderPrompts,
  sortPromptItems
} from "./src/shared/prompt-order.ts";

const packItems = [
  { id: "prompt-1", title: "一", description: "", body: "", packId: "pack-a", aliases: [], tags: [], favorite: false, useCount: 0, lastUsedAt: "" },
  { id: "prompt-2", title: "二", description: "", body: "", packId: "pack-a", aliases: [], tags: [], favorite: false, useCount: 0, lastUsedAt: "" },
  { id: "prompt-3", title: "三", description: "", body: "", packId: "pack-a", aliases: [], tags: [], favorite: false, useCount: 0, lastUsedAt: "" }
];

const reordered = reorderPrompts(packItems, 0, 2);
const persistedOrder = buildPromptOrderFromReplacement(packItems, "pack-a", reordered);

assert.deepEqual(
  sortPromptItems(packItems, persistedOrder).map((item) => item.id),
  reordered.map((item) => item.id)
);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("popup pack navigation follows the rendered tier order", () => {
  const script = `
import assert from "node:assert/strict";
import { sortPromptPacks } from "./src/shared/pack-order.ts";
import {
  getNextPackSelection,
  sortPacksForPopupNavigation
} from "./src/renderer/src/popup-navigation.ts";

const persistedOrder = sortPromptPacks([
  {
    id: "pack-quick-write",
    name: "写作前快启",
    sourceFile: "/tmp/revision.md",
    metadata: { favorite: false, tags: [], aliases: [] }
  },
  {
    id: "pack-quick-revision",
    name: "修稿投稿快启",
    sourceFile: "/tmp/revision.md",
    metadata: { favorite: false, tags: [], aliases: [] }
  },
  {
    id: "pack-submission",
    name: "投稿包与格式化",
    sourceFile: "/tmp/submission-word-package.md",
    metadata: { favorite: false, tags: [], aliases: [] }
  },
  {
    id: "pack-workflow-0",
    name: "00 通用底座",
    sourceFile: "/tmp/revision.md",
    metadata: { favorite: false, tags: [], aliases: [] }
  },
  {
    id: "pack-workflow-1",
    name: "01 写作前阶段",
    sourceFile: "/tmp/revision.md",
    metadata: { favorite: false, tags: [], aliases: [] }
  },
  {
    id: "pack-secondary",
    name: "论文引擎基础",
    sourceFile: "/tmp/revision.md",
    metadata: { favorite: false, tags: [], aliases: [] }
  }
]);

const packs = sortPacksForPopupNavigation(persistedOrder);

assert.deepEqual(
  packs.map((pack) => pack.name),
  ["写作前快启", "修稿投稿快启", "投稿包与格式化", "00 通用底座", "01 写作前阶段", "论文引擎基础"]
);

assert.equal(
  getNextPackSelection("pack-quick-revision", packs, "right"),
  "pack-submission"
);

assert.equal(
  getNextPackSelection("pack-secondary", packs, "left"),
  "pack-workflow-1"
);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("popup chip reordering can round-trip through persisted pack order", () => {
  const script = `
import assert from "node:assert/strict";
import { getPromptPackOrderKey, reorderPacks, sortPromptPacks } from "./src/shared/pack-order.ts";

const packs = [
  { id: "pack-1", name: "日常写作", sourceFile: "/tmp/a.md", metadata: { favorite: false, tags: [], aliases: [] }, items: [] },
  { id: "pack-2", name: "编程", sourceFile: "/tmp/a.md", metadata: { favorite: false, tags: [], aliases: [] }, items: [] },
  { id: "pack-3", name: "常用工具", sourceFile: "/tmp/b.md", metadata: { favorite: false, tags: [], aliases: [] }, items: [] }
];

const reordered = reorderPacks(packs, 2, 0);
const persistedOrder = reordered.map((pack) => getPromptPackOrderKey(pack));

assert.deepEqual(
  sortPromptPacks(packs, persistedOrder).map((pack) => pack.id),
  reordered.map((pack) => pack.id)
);

const movedToEnd = reorderPacks(packs, 0, 2);
const endOrder = movedToEnd.map((pack) => getPromptPackOrderKey(pack));

assert.deepEqual(
  sortPromptPacks(packs, endOrder).map((pack) => pack.id),
  movedToEnd.map((pack) => pack.id)
);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("sortPromptItems does not mutate the original array", () => {
  const script = `
import assert from "node:assert/strict";
import { sortPromptItems } from "./src/renderer/src/popup-navigation.ts";
const items = [
  { title: "B", description: "", body: "", packId: "p", aliases: [], tags: [], favorite: false },
  { title: "A", description: "", body: "", packId: "p", aliases: [], tags: [], favorite: false }
];
const sorted = sortPromptItems(items);
assert.equal(items[0].title, "B");
assert.notEqual(sorted, items);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

// ── getScrollTargetId ─────────────────────────────────────────────────────

test("scroll target is returned only when selection changes to a visible prompt", () => {
  const script = `
import assert from "node:assert/strict";
import { getScrollTargetId } from "./src/renderer/src/popup-navigation.ts";
const visiblePrompts = [
  { id: "prompt-1", title: "A", description: "", body: "", packId: "p", aliases: [], tags: [], favorite: false },
  { id: "prompt-2", title: "B", description: "", body: "", packId: "p", aliases: [], tags: [], favorite: false }
];
assert.equal(
  getScrollTargetId({ visiblePrompts, selectedItemId: "prompt-2", previousItemId: "prompt-1" }),
  "prompt-2"
);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("scroll target is null when selection is unchanged or no longer visible", () => {
  const script = `
import assert from "node:assert/strict";
import { getScrollTargetId } from "./src/renderer/src/popup-navigation.ts";
const visiblePrompts = [
  { id: "prompt-1", title: "A", description: "", body: "", packId: "p", aliases: [], tags: [], favorite: false }
];
assert.equal(
  getScrollTargetId({ visiblePrompts, selectedItemId: "prompt-1", previousItemId: "prompt-1" }),
  null
);
assert.equal(
  getScrollTargetId({ visiblePrompts, selectedItemId: "prompt-9", previousItemId: "prompt-1" }),
  null
);
assert.equal(
  getScrollTargetId({ visiblePrompts, selectedItemId: null, previousItemId: "prompt-1" }),
  null
);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("popup hover selection stays keyboard-first until the pointer actually moves", () => {
  const script = `
import assert from "node:assert/strict";
import { getNextPopupPointerHoverState } from "./src/renderer/src/popup-navigation.ts";

let hoverEnabled = true;

hoverEnabled = getNextPopupPointerHoverState(hoverEnabled, "popup-opened");
assert.equal(hoverEnabled, false);

hoverEnabled = getNextPopupPointerHoverState(hoverEnabled, "pointer-moved");
assert.equal(hoverEnabled, true);

hoverEnabled = getNextPopupPointerHoverState(hoverEnabled, "popup-opened");
assert.equal(hoverEnabled, false);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

// ── pack navigation ───────────────────────────────────────────────────────

test("pack navigation is disabled during search", () => {
  const script = `
import assert from "node:assert/strict";
import { shouldHandlePackNavigation } from "./src/renderer/src/popup-navigation.ts";
assert.equal(shouldHandlePackNavigation("ArrowRight", true), false);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("ArrowRight advances to the next pack", () => {
  const script = `
import assert from "node:assert/strict";
import { getNextPackSelection } from "./src/renderer/src/popup-navigation.ts";
const packs = [{ id: "a" }, { id: "b" }, { id: "c" }];
assert.equal(getNextPackSelection("a", packs, "right"), "b");
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("ArrowRight clamps at the last pack", () => {
  const script = `
import assert from "node:assert/strict";
import { getNextPackSelection } from "./src/renderer/src/popup-navigation.ts";
const packs = [{ id: "a" }, { id: "b" }];
assert.equal(getNextPackSelection("b", packs, "right"), "b");
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("empty packs returns current pack id", () => {
  const script = `
import assert from "node:assert/strict";
import { getNextPackSelection } from "./src/renderer/src/popup-navigation.ts";
assert.equal(getNextPackSelection("x", [], "right"), "x");
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("variable form fields ignore popup navigation and confirm hotkeys while focused", () => {
  const script = `
import assert from "node:assert/strict";
import { shouldIgnorePopupHotkeys } from "./src/renderer/src/popup-navigation.ts";

const variableFieldTarget = {
  dataset: {
    promptbarVariableField: "true"
  }
};

assert.equal(shouldIgnorePopupHotkeys("ArrowDown", variableFieldTarget), true);
assert.equal(shouldIgnorePopupHotkeys("ArrowUp", variableFieldTarget), true);
assert.equal(shouldIgnorePopupHotkeys("ArrowLeft", variableFieldTarget), true);
assert.equal(shouldIgnorePopupHotkeys("ArrowRight", variableFieldTarget), true);
assert.equal(shouldIgnorePopupHotkeys("Enter", variableFieldTarget), true);
assert.equal(shouldIgnorePopupHotkeys("1", variableFieldTarget), true);
assert.equal(shouldIgnorePopupHotkeys("Escape", variableFieldTarget), false);
assert.equal(shouldIgnorePopupHotkeys("ArrowDown", null), false);
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("search field only keeps ArrowLeft and ArrowRight for text editing when query is non-empty", () => {
  const script = `
import assert from "node:assert/strict";
import {
  resolvePopupKeyboardAction,
  shouldIgnorePopupHotkeys
} from "./src/renderer/src/popup-navigation.ts";
import { shouldUsePrimaryConfirmShortcut } from "./src/renderer/src/prompt-helpers.ts";

const searchFieldTarget = {
  dataset: {
    promptbarSearchField: "true"
  }
};

assert.equal(shouldIgnorePopupHotkeys("ArrowLeft", searchFieldTarget, ""), false);
assert.equal(shouldIgnorePopupHotkeys("ArrowRight", searchFieldTarget, ""), false);
assert.equal(shouldIgnorePopupHotkeys("ArrowLeft", searchFieldTarget, "keyword"), true);
assert.equal(shouldIgnorePopupHotkeys("ArrowRight", searchFieldTarget, "keyword"), true);
assert.equal(shouldIgnorePopupHotkeys("ArrowDown", searchFieldTarget, ""), false);

const packs = [{ id: "pack-a" }, { id: "pack-b" }];
const prompt = {
  id: "prompt-1",
  packId: "pack-a",
  title: "Prompt 1",
  body: "",
  description: "",
  favorite: false,
  tags: [],
  aliases: []
};

const clearSearchAction = resolvePopupKeyboardAction({
  eventKey: "Escape",
  target: searchFieldTarget,
  query: "keyword",
  isSubmitting: false,
  currentPackId: "pack-a",
  selectedIndex: 0,
  selectedPrompt: prompt,
  visiblePrompts: [prompt],
  visiblePacks: packs,
  shouldUsePrimaryConfirmShortcut
});
assert.deepEqual(clearSearchAction, { type: "clear-search" });

const rightArrowWhenQueryEmpty = resolvePopupKeyboardAction({
  eventKey: "ArrowRight",
  target: searchFieldTarget,
  query: "",
  isSubmitting: false,
  currentPackId: "pack-a",
  selectedIndex: 0,
  selectedPrompt: prompt,
  visiblePrompts: [prompt],
  visiblePacks: packs,
  shouldUsePrimaryConfirmShortcut
});
assert.deepEqual(rightArrowWhenQueryEmpty, { type: "select-pack", packId: "pack-b" });

const rightArrowWhenSearching = resolvePopupKeyboardAction({
  eventKey: "ArrowRight",
  target: searchFieldTarget,
  query: "keyword",
  isSubmitting: false,
  currentPackId: "pack-a",
  selectedIndex: 0,
  selectedPrompt: prompt,
  visiblePrompts: [prompt],
  visiblePacks: packs,
  shouldUsePrimaryConfirmShortcut
});
assert.deepEqual(rightArrowWhenSearching, { type: "noop" });

const escapeAction = resolvePopupKeyboardAction({
  eventKey: "Escape",
  target: searchFieldTarget,
  query: "",
  isSubmitting: false,
  currentPackId: "pack-a",
  selectedIndex: 0,
  selectedPrompt: prompt,
  visiblePrompts: [prompt],
  visiblePacks: packs,
  shouldUsePrimaryConfirmShortcut
});
assert.deepEqual(escapeAction, { type: "escape" });
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("keyboard action resolver keeps pack navigation disabled during search and confirms on Enter", () => {
  const script = `
import assert from "node:assert/strict";
import { resolvePopupKeyboardAction } from "./src/renderer/src/popup-navigation.ts";
import { shouldUsePrimaryConfirmShortcut } from "./src/renderer/src/prompt-helpers.ts";

const makePrompt = (id, packId = "pack-a") => ({
  id,
  packId,
  title: id,
  body: "",
  description: "",
  favorite: false,
  tags: [],
  aliases: [],
  variables: [],
  sourceFile: "/tmp/example.md"
});

const packs = [
  { id: "pack-a", name: "A", sourceFile: "/tmp/a.md", items: [makePrompt("prompt-1")] },
  { id: "pack-b", name: "B", sourceFile: "/tmp/b.md", items: [makePrompt("prompt-2", "pack-b")] }
];

const searchingAction = resolvePopupKeyboardAction({
  eventKey: "ArrowRight",
  target: null,
  query: "search",
  isSubmitting: false,
  currentPackId: "pack-a",
  selectedIndex: 0,
  selectedPrompt: packs[0].items[0],
  visiblePrompts: packs[0].items,
  visiblePacks: packs,
  shouldUsePrimaryConfirmShortcut
});
assert.deepEqual(searchingAction, { type: "noop" });

const confirmAction = resolvePopupKeyboardAction({
  eventKey: "Enter",
  target: null,
  query: "",
  isSubmitting: false,
  currentPackId: "pack-a",
  selectedIndex: 0,
  selectedPrompt: packs[0].items[0],
  visiblePrompts: packs[0].items,
  visiblePacks: packs,
  shouldUsePrimaryConfirmShortcut
});
assert.deepEqual(confirmAction, {
  type: "confirm",
  prompt: packs[0].items[0],
  index: 0
});
`;
  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
