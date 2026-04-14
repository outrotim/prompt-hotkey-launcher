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

const makePrompt = (body) => `{ id: "p:t", packId: "p", title: "T", body: ${JSON.stringify(body)}, description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md" }`;

test("{{today}} renders as YYYY-MM-DD", () => {
  const r = run(`
import assert from "node:assert/strict";
import { renderPromptBody } from "./src/core/template.ts";
const result = renderPromptBody(${makePrompt("Date: {{today}}")}, {});
assert.match(result, /^Date: \\d{4}-\\d{2}-\\d{2}$/);
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("{{yesterday}} is one day before {{today}}", () => {
  const r = run(`
import assert from "node:assert/strict";
import { renderPromptBody } from "./src/core/template.ts";
const today = renderPromptBody(${makePrompt("{{today}}")}, {});
const yesterday = renderPromptBody(${makePrompt("{{yesterday}}")}, {});
const diff = new Date(today).getTime() - new Date(yesterday).getTime();
assert.equal(diff, 86400000, "yesterday should be exactly 1 day before today");
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("{{now}} renders as YYYY-MM-DD HH:MM", () => {
  const r = run(`
import assert from "node:assert/strict";
import { renderPromptBody } from "./src/core/template.ts";
const result = renderPromptBody(${makePrompt("Time: {{now}}")}, {});
assert.match(result, /^Time: \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$/);
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("parser excludes date variables from UI variable list", () => {
  const r = run(`
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parsePromptFile } from "./src/core/parser.ts";

const dir = mkdtempSync(join(tmpdir(), "promptbar-date-"));
const filePath = join(dir, "test.md");
writeFileSync(filePath, [
  "---", "tags: []", "aliases: []", "favorite: false", "---",
  "", "# Pack", "", "## Date Test",
  "Today is {{today}}, yesterday was {{yesterday}}, name: {{name}}"
].join("\\n"));

const packs = parsePromptFile(filePath);
const vars = packs[0].items[0].variables.map(v => v.key);
assert.ok(!vars.includes("today"), "today must not be in variables");
assert.ok(!vars.includes("yesterday"), "yesterday must not be in variables");
assert.ok(vars.includes("name"), "name must be in variables");
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
