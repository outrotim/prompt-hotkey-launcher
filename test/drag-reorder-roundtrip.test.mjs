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

// ── Prompt reorder roundtrip through persist → sort ────────────────────

test("prompt drag reorder: move first to last, persist, and sort back produces same order", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import {
  reorderPrompts,
  buildPromptOrderFromReplacement,
  sortPromptItems,
  resolveReorderTargetIndex
} from "./src/shared/prompt-order.ts";

const items = [
  { id: "p1", packId: "pk", title: "A", favorite: false, useCount: 0, lastUsedAt: "" },
  { id: "p2", packId: "pk", title: "B", favorite: false, useCount: 0, lastUsedAt: "" },
  { id: "p3", packId: "pk", title: "C", favorite: false, useCount: 0, lastUsedAt: "" },
  { id: "p4", packId: "pk", title: "D", favorite: false, useCount: 0, lastUsedAt: "" }
];

// Simulate drag: move p1 (index 0) to after p4 (index 3, placement "after")
const targetIndex = resolveReorderTargetIndex(0, 3, "after");
const reordered = reorderPrompts(items, 0, Math.min(items.length - 1, targetIndex));
const persisted = buildPromptOrderFromReplacement(items, "pk", reordered);

// Apply persisted order to the original unsorted items
const restored = sortPromptItems(items, persisted);
assert.deepEqual(
  restored.map(i => i.id),
  reordered.map(i => i.id),
  "persisted order must reproduce the drag result"
);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("prompt drag reorder: move last to first produces stable roundtrip", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import {
  reorderPrompts,
  buildPromptOrderFromReplacement,
  sortPromptItems,
  resolveReorderTargetIndex
} from "./src/shared/prompt-order.ts";

const items = [
  { id: "p1", packId: "pk", title: "A", favorite: false, useCount: 0, lastUsedAt: "" },
  { id: "p2", packId: "pk", title: "B", favorite: false, useCount: 0, lastUsedAt: "" },
  { id: "p3", packId: "pk", title: "C", favorite: false, useCount: 0, lastUsedAt: "" }
];

// Drag p3 (index 2) before p1 (index 0)
const targetIndex = resolveReorderTargetIndex(2, 0, "before");
const reordered = reorderPrompts(items, 2, targetIndex);
assert.deepEqual(reordered.map(i => i.id), ["p3", "p1", "p2"]);

const persisted = buildPromptOrderFromReplacement(items, "pk", reordered);
const restored = sortPromptItems(items, persisted);
assert.deepEqual(restored.map(i => i.id), ["p3", "p1", "p2"]);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("prompt drag reorder: adjacent swap is stable", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import {
  reorderPrompts,
  buildPromptOrderFromReplacement,
  sortPromptItems,
  resolveReorderTargetIndex
} from "./src/shared/prompt-order.ts";

const items = [
  { id: "p1", packId: "pk", title: "A", favorite: false, useCount: 0, lastUsedAt: "" },
  { id: "p2", packId: "pk", title: "B", favorite: false, useCount: 0, lastUsedAt: "" },
  { id: "p3", packId: "pk", title: "C", favorite: false, useCount: 0, lastUsedAt: "" }
];

// Swap p1 and p2: drag p1 after p2
const targetIndex = resolveReorderTargetIndex(0, 1, "after");
const reordered = reorderPrompts(items, 0, Math.min(items.length - 1, targetIndex));
assert.deepEqual(reordered.map(i => i.id), ["p2", "p1", "p3"]);

const persisted = buildPromptOrderFromReplacement(items, "pk", reordered);
const restored = sortPromptItems(items, persisted);
assert.deepEqual(restored.map(i => i.id), ["p2", "p1", "p3"]);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

// ── Pack reorder roundtrip ─────────────────────────────────────────────

test("pack drag reorder: move middle to first, persist, and sort back is stable", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import {
  reorderPacks,
  getPromptPackOrderKey,
  sortPromptPacks
} from "./src/shared/pack-order.ts";

const packs = [
  { id: "pk1", name: "Writing", sourceFile: "/a.md", metadata: { favorite: false, tags: [], aliases: [] }, items: [] },
  { id: "pk2", name: "Coding", sourceFile: "/a.md", metadata: { favorite: false, tags: [], aliases: [] }, items: [] },
  { id: "pk3", name: "Tools", sourceFile: "/b.md", metadata: { favorite: false, tags: [], aliases: [] }, items: [] }
];

// Move pk3 (index 2) to index 0
const reordered = reorderPacks(packs, 2, 0);
assert.deepEqual(reordered.map(p => p.id), ["pk3", "pk1", "pk2"]);

const persisted = reordered.map(p => getPromptPackOrderKey(p));
const restored = sortPromptPacks(packs, persisted);
assert.deepEqual(restored.map(p => p.id), ["pk3", "pk1", "pk2"],
  "pack order must be stable through persist-sort roundtrip");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("pack drag reorder: reordering same index is a no-op", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { reorderPacks } from "./src/shared/pack-order.ts";

const packs = [{ id: "a" }, { id: "b" }, { id: "c" }];
const result = reorderPacks(packs, 1, 1);
assert.deepEqual(result.map(p => p.id), ["a", "b", "c"]);
assert.notStrictEqual(result, packs, "must return a new array even for no-op");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

// ── Cross-pack prompt move roundtrip ───────────────────────────────────

test("cross-pack prompt move: movePromptBetweenPacks produces correct result", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { movePromptBetweenPacks } from "./src/shared/prompt-order.ts";

const packs = [
  {
    id: "pk1",
    items: [
      { id: "p1" },
      { id: "p2" }
    ]
  },
  {
    id: "pk2",
    items: [
      { id: "p3" },
      { id: "p4" }
    ]
  }
];

// Move p2 from pk1 to pk2, before p3
const result = movePromptBetweenPacks(packs, "p2", "pk2", "p3", "before");

const pk1Items = result.find(p => p.id === "pk1").items;
const pk2Items = result.find(p => p.id === "pk2").items;

assert.deepEqual(pk1Items.map(i => i.id), ["p1"], "source pack should lose the moved item");
assert.deepEqual(pk2Items.map(i => i.id), ["p2", "p3", "p4"], "target pack should gain the item before target");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("cross-pack prompt move: move to end of target pack", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { movePromptBetweenPacks } from "./src/shared/prompt-order.ts";

const packs = [
  { id: "pk1", items: [{ id: "p1" }, { id: "p2" }] },
  { id: "pk2", items: [{ id: "p3" }] }
];

// Move p1 to pk2, after p3
const result = movePromptBetweenPacks(packs, "p1", "pk2", "p3", "after");

assert.deepEqual(
  result.find(p => p.id === "pk1").items.map(i => i.id),
  ["p2"]
);
assert.deepEqual(
  result.find(p => p.id === "pk2").items.map(i => i.id),
  ["p3", "p1"]
);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

// ── resolveReorderTargetIndex edge cases ───────────────────────────────

test("resolveReorderTargetIndex: same index with before/after placement", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { resolveReorderTargetIndex } from "./src/shared/prompt-order.ts";

// Drag item to its own position
assert.equal(resolveReorderTargetIndex(2, 2, "before"), 2, "same index + before = same");
assert.equal(resolveReorderTargetIndex(2, 2, "after"), 3, "same index + after = next");

// Forward drag
assert.equal(resolveReorderTargetIndex(0, 3, "before"), 2, "forward drag + before");
assert.equal(resolveReorderTargetIndex(0, 3, "after"), 3, "forward drag + after");

// Backward drag
assert.equal(resolveReorderTargetIndex(3, 0, "before"), 0, "backward drag + before");
assert.equal(resolveReorderTargetIndex(3, 0, "after"), 1, "backward drag + after");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

// ── getDropPlacement ───────────────────────────────────────────────────

test("getDropPlacement: top half returns before, bottom half returns after", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { getDropPlacement } from "./src/shared/prompt-order.ts";

// Element at top=100, height=40
assert.equal(getDropPlacement(100, 40, 110), "before", "click in top half");
assert.equal(getDropPlacement(100, 40, 130), "after", "click in bottom half");
assert.equal(getDropPlacement(100, 40, 120), "after", "exact midpoint = after");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
