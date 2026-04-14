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

test("getPinyinInitials converts pure Chinese to initials", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { getPinyinInitials } from "./src/shared/pinyin-initials.ts";

const initials = getPinyinInitials("编程");
// "编" should map to "b", "程" should map to "c"
assert.equal(initials, "bc");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("getPinyinInitials passes through non-CJK characters", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { getPinyinInitials } from "./src/shared/pinyin-initials.ts";

assert.equal(getPinyinInitials("Hello"), "hello");
assert.equal(getPinyinInitials("ABC 123"), "abc 123");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("getPinyinInitials handles mixed Chinese and English", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { getPinyinInitials } from "./src/shared/pinyin-initials.ts";

const result = getPinyinInitials("Hello 世界");
// "Hello " stays as is (lowercased), "世" → s, "界" → j
assert.equal(result, "hello sj");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("getPinyinInitials handles empty string", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { getPinyinInitials } from "./src/shared/pinyin-initials.ts";

assert.equal(getPinyinInitials(""), "");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("getVisiblePrompts matches Chinese prompts by pinyin initials", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { getVisiblePrompts } from "./src/renderer/src/popup-navigation.ts";

const makeItem = (title) => ({
  title,
  description: "",
  body: "",
  packId: "p",
  aliases: [],
  tags: [],
  favorite: false
});

const items = [
  makeItem("编程助手"),
  makeItem("日常写作"),
  makeItem("Deploy Script")
];

// Search by pinyin initials for "编程" (bc)
const bcResults = getVisiblePrompts(items, [], "bc");
assert.equal(bcResults.length, 1);
assert.equal(bcResults[0].title, "编程助手");

// Search by pinyin initials for "日常" (rc)
const rcResults = getVisiblePrompts(items, [], "rc");
assert.equal(rcResults.length, 1);
assert.equal(rcResults[0].title, "日常写作");

// Regular search still works
const deployResults = getVisiblePrompts(items, [], "deploy");
assert.equal(deployResults.length, 1);
assert.equal(deployResults[0].title, "Deploy Script");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("getVisiblePrompts pinyin search is case-insensitive", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { getVisiblePrompts } from "./src/renderer/src/popup-navigation.ts";

const items = [{
  title: "编程助手",
  description: "",
  body: "",
  packId: "p",
  aliases: [],
  tags: [],
  favorite: false
}];

// Uppercase initials should also match
const results = getVisiblePrompts(items, [], "BC");
assert.equal(results.length, 1);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
