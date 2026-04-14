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

test("{{@title}} resolves to referenced prompt body", () => {
  const r = run(`
import assert from "node:assert/strict";
import { renderPromptBody } from "./src/core/template.ts";

const items = [
  { id: "p:grammar", packId: "p", title: "检查语法", body: "Fix grammar.", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md" },
  { id: "p:tone", packId: "p", title: "优化语气", body: "Improve tone.", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md" }
];

const main = { id: "p:main", packId: "p", title: "Main", body: "Step1: {{@检查语法}} Step2: {{@优化语气}}", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md" };

const result = renderPromptBody(main, {}, items);
assert.equal(result, "Step1: Fix grammar. Step2: Improve tone.");
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("{{@id}} resolves by prompt id as well as title", () => {
  const r = run(`
import assert from "node:assert/strict";
import { renderPromptBody } from "./src/core/template.ts";

const items = [
  { id: "pack:slug", packId: "pack", title: "My Prompt", body: "resolved body", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md" }
];

const main = { id: "p:main", packId: "p", title: "Main", body: "{{@pack:slug}}", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md" };

const result = renderPromptBody(main, {}, items);
assert.equal(result, "resolved body");
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("circular reference A→B→A is detected and stops", () => {
  const r = run(`
import assert from "node:assert/strict";
import { renderPromptBody } from "./src/core/template.ts";

const items = [
  { id: "p:a", packId: "p", title: "A", body: "start {{@B}} end", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md" },
  { id: "p:b", packId: "p", title: "B", body: "mid {{@A}} fin", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md" }
];

const result = renderPromptBody(items[0], {}, items);
// A expands B, B tries to expand A but A is in visited → keeps {{@A}} as-is
assert.equal(result, "start mid {{@A}} fin end");
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("nesting depth beyond 3 stops expanding", () => {
  const r = run(`
import assert from "node:assert/strict";
import { renderPromptBody } from "./src/core/template.ts";

const items = [
  { id: "p:l1", packId: "p", title: "L1", body: "{{@L2}}", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md" },
  { id: "p:l2", packId: "p", title: "L2", body: "{{@L3}}", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md" },
  { id: "p:l3", packId: "p", title: "L3", body: "{{@L4}}", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md" },
  { id: "p:l4", packId: "p", title: "L4", body: "deep", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md" }
];

const main = { id: "p:main", packId: "p", title: "Main", body: "{{@L1}}", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md" };

const result = renderPromptBody(main, {}, items);
// main→L1(depth 0)→L2(depth 1)→L3(depth 2)→stops at depth 3, keeps {{@L4}}
assert.equal(result, "{{@L4}}");
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("missing reference keeps {{@...}} as-is", () => {
  const r = run(`
import assert from "node:assert/strict";
import { renderPromptBody } from "./src/core/template.ts";

const main = { id: "p:main", packId: "p", title: "Main", body: "{{@nonexistent}}", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md" };

const result = renderPromptBody(main, {}, []);
assert.equal(result, "{{@nonexistent}}");
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
