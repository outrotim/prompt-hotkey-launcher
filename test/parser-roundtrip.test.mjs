import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
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

test("parser and serializer preserve distinct stable ids for duplicate prompt titles across a round trip", () => {
  const directory = mkdtempSync(join(tmpdir(), "promptbar-roundtrip-"));
  const filePath = join(directory, "duplicates.md");
  writeFileSync(
    filePath,
    [
      "---",
      "tags: [测试]",
      "aliases: [重复标题]",
      "favorite: false",
      "---",
      "",
      "# 同名分组",
      "",
      "## 同名提示词",
      "第一段正文",
      "",
      "## 同名提示词",
      "第二段正文"
    ].join("\n")
  );

  const script = `
import assert from "node:assert/strict";
import { parsePromptFile } from "./src/core/parser.ts";
import { serializePromptFile } from "./src/core/serializer.ts";

const packs = parsePromptFile(${JSON.stringify(filePath)});
assert.equal(packs.length, 1);
assert.equal(packs[0].items.length, 2);
assert.notEqual(packs[0].items[0].id, packs[0].items[1].id);

const serialized = serializePromptFile(packs);
assert.match(serialized, /<!-- promptbar:id=/g);

const reparsed = parsePromptFile(${JSON.stringify(filePath)}.replace("duplicates.md", "duplicates-roundtrip.md"));
`;

  const preResult = runTypeScriptCheck(script.replace(
    'const reparsed = parsePromptFile(' + JSON.stringify(filePath) + '.replace("duplicates.md", "duplicates-roundtrip.md"));',
    [
      `const roundTripPath = ${JSON.stringify(join(directory, "duplicates-roundtrip.md"))};`,
      "import { writeFileSync } from \"node:fs\";",
      "writeFileSync(roundTripPath, serialized);",
      "const reparsed = parsePromptFile(roundTripPath);",
      "assert.equal(reparsed[0].items.length, 2);",
      "assert.deepEqual(",
      "  reparsed[0].items.map((item) => item.id),",
      "  packs[0].items.map((item) => item.id)",
      ");"
    ].join("\n")
  ));

  assert.equal(preResult.status, 0, preResult.stderr || preResult.stdout);
});

test("loadPromptLibrary sync and async variants include markdown files from nested prompt subdirectories", () => {
  const directory = mkdtempSync(join(tmpdir(), "promptbar-nested-"));
  writeFileSync(join(directory, "root.md"), "# 根目录包\n\n## 根目录提示词\n内容\n");
  mkdirSync(join(directory, "nested"));
  writeFileSync(join(directory, "nested", "child.md"), "# 子目录包\n\n## 子目录提示词\n内容\n");

  const script = `
import assert from "node:assert/strict";
import { loadPromptLibrary, loadPromptLibraryAsync } from "./src/core/parser.ts";

const syncLibrary = loadPromptLibrary(${JSON.stringify(directory)});
const asyncLibrary = await loadPromptLibraryAsync(${JSON.stringify(directory)});
assert.deepEqual(
  syncLibrary.packs.map((pack) => pack.name).sort(),
  ["子目录包", "根目录包"]
);
assert.deepEqual(
  syncLibrary.items.map((item) => item.title).sort(),
  ["子目录提示词", "根目录提示词"]
);
assert.deepEqual(
  asyncLibrary.packs.map((pack) => pack.name).sort(),
  syncLibrary.packs.map((pack) => pack.name).sort()
);
assert.deepEqual(
  asyncLibrary.items.map((item) => item.title).sort(),
  syncLibrary.items.map((item) => item.title).sort()
);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
