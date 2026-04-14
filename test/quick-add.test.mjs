import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(script) {
  return spawnSync(
    "node",
    ["--experimental-strip-types", "--experimental-specifier-resolution=node", "--input-type=module", "-e", script],
    { cwd, encoding: "utf8" }
  );
}

test("quick-add appends a correctly formatted prompt entry through the atomic save path", () => {
  const root = mkdtempSync(join(tmpdir(), "promptbar-qa-"));
  const filePath = join(root, "test.md");
  writeFileSync(filePath, [
    "---", "tags: []", "aliases: []", "favorite: false", "---",
    "", "# Pack", "", "## Existing", "Body"
  ].join("\n"));

  try {
    const r = run(`
import assert from "node:assert/strict";
import { parsePromptFile } from "./src/core/parser.ts";
import { serializePromptFile } from "./src/core/serializer.ts";
import { buildQuickAddPromptResult } from "./src/shared/quick-add.ts";

const packs = parsePromptFile(${JSON.stringify(filePath)});
const result = buildQuickAddPromptResult(packs, {
  packId: packs[0].id,
  title: "New Prompt",
  body: "Hello {{name}}"
}, 1234);

const serialized = serializePromptFile(result.nextPacks);
assert.ok(serialized.includes("## Existing"));
assert.ok(serialized.includes("## New Prompt"));
assert.ok(serialized.includes("<!-- promptbar:id=" + packs[0].id + ":new-prompt-1234 -->"));

const content = serialized;
assert.ok(content.includes("## Existing"), "original content preserved");
assert.ok(content.includes("## New Prompt"), "new prompt appended");
assert.ok(content.includes("Hello {{name}}"), "body appended");
assert.ok(content.includes("<!-- promptbar:id=" + packs[0].id + ":new-prompt-1234 -->"), "id comment appended");
`);
    assert.equal(r.status, 0, r.stderr || r.stdout);

    const r2 = run(`
import assert from "node:assert/strict";
import { parsePromptFile } from "./src/core/parser.ts";
import { serializePromptFile } from "./src/core/serializer.ts";
import { writeFileAtomically } from "./src/main/atomic-write.ts";
import { buildQuickAddPromptResult } from "./src/shared/quick-add.ts";

const initialPacks = parsePromptFile(${JSON.stringify(filePath)});
const result = buildQuickAddPromptResult(initialPacks, {
  packId: initialPacks[0].id,
  title: "New Prompt",
  body: "Hello {{name}}"
}, 1234);
writeFileAtomically(${JSON.stringify(filePath)}, serializePromptFile(result.nextPacks));
const nextPacks = parsePromptFile(${JSON.stringify(filePath)});
assert.equal(nextPacks[0].items.length, 2);
assert.equal(nextPacks[0].items[0].title, "Existing");
assert.equal(nextPacks[0].items[1].title, "New Prompt");
assert.ok(nextPacks[0].items[1].body.includes("Hello {{name}}"));
`);
    assert.equal(r2.status, 0, r2.stderr || r2.stdout);

    const leftovers = readdirSync(root).filter((name) => name.endsWith(".tmp"));
    assert.deepEqual(leftovers, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("quick-add with empty title uses default name", () => {
  const r = run(`
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePromptFile } from "./src/core/parser.ts";
import { buildQuickAddPromptResult } from "./src/shared/quick-add.ts";

const root = mkdtempSync(join(tmpdir(), "promptbar-qa-title-"));
const filePath = join(root, "test.md");
writeFileSync(filePath, [
  "---", "tags: []", "aliases: []", "favorite: false", "---",
  "", "# Pack", "", "## Existing", "Body"
].join("\\n"));

try {
  const packs = parsePromptFile(filePath);
  const result = buildQuickAddPromptResult(packs, {
    packId: packs[0].id,
    title: "",
    body: ""
  }, 99);

  assert.ok(result.promptId.endsWith(":新提示词-2-99"));
  const nextPacks = result.nextPacks;
  assert.equal(nextPacks[0].items[1].title, "新提示词 2");
  assert.equal(nextPacks[0].items[1].body, "请在这里输入提示词正文。");
} finally {
  rmSync(root, { recursive: true, force: true });
}
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("quick-add creates a new markdown prompt file for directory packs", () => {
  const root = mkdtempSync(join(tmpdir(), "promptbar-qa-dir-pack-"));
  const packDir = join(root, "tools");
  mkdirSync(packDir, { recursive: true });
  writeFileSync(join(packDir, "_pack.yaml"), "name: Tools\nfavorite: false\n");
  writeFileSync(join(packDir, "existing.md"), "Existing body.\n");

  try {
    const r = run(`
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadPromptLibrary } from "./src/core/parser.ts";
import { writeFileAtomically } from "./src/main/atomic-write.ts";
import { buildQuickAddDirectoryPromptFile } from "./src/shared/quick-add.ts";

const root = ${JSON.stringify(root)};
const packYamlPath = join(root, "tools", "_pack.yaml");
const libraryBefore = loadPromptLibrary(root);
const pack = libraryBefore.packs.find((entry) => entry.name === "Tools");

assert.ok(pack, "directory pack should load before quick-add");
const result = buildQuickAddDirectoryPromptFile(pack, {
  packId: pack.id,
  title: "新提示词",
  body: "Directory quick add body"
}, 1234);

assert.ok(result.promptId.includes(pack.id), "quick-add returns prompt id");
writeFileAtomically(result.filePath, result.content);
const files = readdirSync(join(root, "tools")).sort();
assert.deepEqual(files, ["_pack.yaml", "existing.md", "新提示词.md"]);

const libraryAfter = loadPromptLibrary(root);
const nextPack = libraryAfter.packs.find((entry) => entry.id === pack.id);
assert.ok(nextPack, "directory pack should still load after quick-add");
assert.equal(nextPack.items.length, 2);
assert.equal(nextPack.items[1].title, "新提示词");
assert.equal(nextPack.items[1].body, "Directory quick add body");
`);
    assert.equal(r.status, 0, r.stderr || r.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("directory pack quick-add returns a promptId that survives reload", () => {
  const root = mkdtempSync(join(tmpdir(), "promptbar-qa-dir-pack-id-"));
  const packDir = join(root, "tools");
  mkdirSync(packDir, { recursive: true });
  writeFileSync(join(packDir, "_pack.yaml"), "name: Tools\nfavorite: false\n");
  writeFileSync(join(packDir, "existing.md"), "Existing body.\n");

  try {
    const r = run(`
import assert from "node:assert/strict";
import { loadPromptLibrary } from "./src/core/parser.ts";
import { writeFileAtomically } from "./src/main/atomic-write.ts";
import { buildQuickAddDirectoryPromptFile } from "./src/shared/quick-add.ts";

const root = ${JSON.stringify(root)};
const libraryBefore = loadPromptLibrary(root);
const pack = libraryBefore.packs.find((entry) => entry.name === "Tools");
assert.ok(pack, "directory pack should load before quick-add");

const result = buildQuickAddDirectoryPromptFile(pack, {
  packId: pack.id,
  title: "新提示词",
  body: "Directory quick add body"
}, 1234);

writeFileAtomically(result.filePath, result.content);

const libraryAfter = loadPromptLibrary(root);
const nextPack = libraryAfter.packs.find((entry) => entry.id === pack.id);
assert.ok(nextPack, "directory pack should still load after quick-add");
const nextPrompt = nextPack.items.find((item) => item.title === "新提示词");
assert.ok(nextPrompt, "reloaded prompt should be discoverable");
assert.equal(nextPrompt.id, result.promptId);
`);
    assert.equal(r.status, 0, r.stderr || r.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
