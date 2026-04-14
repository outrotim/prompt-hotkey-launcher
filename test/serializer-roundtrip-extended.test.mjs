import test from "node:test";
import assert from "node:assert/strict";
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

test("serializer preserves output: clipboard through roundtrip", () => {
  const r = run(`
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parsePromptFile } from "./src/core/parser.ts";
import { serializePromptFile } from "./src/core/serializer.ts";

const dir = mkdtempSync(join(tmpdir(), "promptbar-ser-"));
const filePath = join(dir, "test.md");

writeFileSync(filePath, [
  "---",
  'tags: ["test"]',
  "aliases: []",
  "favorite: false",
  "output: clipboard",
  "---",
  "", "# Pack", "", "## Prompt", "Body text"
].join("\\n"));

const packs = parsePromptFile(filePath);
assert.equal(packs[0].metadata.output, "clipboard");

const serialized = serializePromptFile(packs);
assert.ok(serialized.includes("output: clipboard"), "serialized must include output field");

// Write back and re-parse
writeFileSync(filePath, serialized);
const reparsed = parsePromptFile(filePath);
assert.equal(reparsed[0].metadata.output, "clipboard", "output must survive roundtrip");
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("serializer preserves after: shell + command through roundtrip", () => {
  const r = run(`
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parsePromptFile } from "./src/core/parser.ts";
import { serializePromptFile } from "./src/core/serializer.ts";

const dir = mkdtempSync(join(tmpdir(), "promptbar-ser-"));
const filePath = join(dir, "test.md");

writeFileSync(filePath, [
  "---",
  "tags: []",
  "aliases: []",
  "favorite: false",
  "after: shell",
  'command: "echo hello"',
  "---",
  "", "# Pack", "", "## Prompt", "Body"
].join("\\n"));

const packs = parsePromptFile(filePath);
assert.equal(packs[0].metadata.after?.type, "shell");
assert.equal(packs[0].metadata.after?.command, "echo hello");

const serialized = serializePromptFile(packs);
assert.ok(serialized.includes("after: shell"), "must include after field");
assert.ok(serialized.includes("echo hello"), "must include command");

writeFileSync(filePath, serialized);
const reparsed = parsePromptFile(filePath);
assert.equal(reparsed[0].metadata.after?.type, "shell");
assert.equal(reparsed[0].metadata.after?.command, "echo hello");
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("serializer omits output field when it is paste (default)", () => {
  const r = run(`
import assert from "node:assert/strict";
import { serializePromptFile } from "./src/core/serializer.ts";

const packs = [{
  id: "p", name: "Pack", sourceFile: "/t.md",
  metadata: { favorite: false, tags: [], aliases: [], output: "paste" },
  items: [{ id: "p:i", packId: "p", title: "T", body: "B", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md" }]
}];

const serialized = serializePromptFile(packs);
assert.ok(!serialized.includes("output:"), "default paste mode should not be serialized");
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
