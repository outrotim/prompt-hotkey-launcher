import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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

test("directory with _pack.yaml is loaded as a pack with per-file prompts", () => {
  const root = mkdtempSync(join(tmpdir(), "promptbar-dirpack-"));
  const packDir = join(root, "my-pack");
  mkdirSync(packDir, { recursive: true });
  writeFileSync(join(packDir, "_pack.yaml"), "name: My Pack\nfavorite: true\n");
  writeFileSync(join(packDir, "grammar.md"), "Check grammar carefully.\n");
  writeFileSync(join(packDir, "tone.md"), "Adjust the tone.\n");

  try {
    const r = run(`
import assert from "node:assert/strict";
import { loadPromptLibrary } from "./src/core/parser.ts";

const library = loadPromptLibrary(${JSON.stringify(root)});
assert.equal(library.packs.length, 1);
assert.equal(library.packs[0].name, "My Pack");
assert.equal(library.packs[0].metadata.favorite, true);
assert.equal(library.packs[0].items.length, 2);

const titles = library.packs[0].items.map(i => i.title).sort();
assert.deepEqual(titles, ["grammar", "tone"]);
assert.ok(library.packs[0].items[0].body.length > 0);
`);
    assert.equal(r.status, 0, r.stderr || r.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("directory without _pack.yaml is treated as regular subdirectory", () => {
  const root = mkdtempSync(join(tmpdir(), "promptbar-dirpack-"));
  const subDir = join(root, "sub");
  mkdirSync(subDir, { recursive: true });
  writeFileSync(join(subDir, "note.md"), [
    "---", "tags: []", "aliases: []", "favorite: false", "---",
    "", "# Sub Pack", "", "## Note", "A note."
  ].join("\n"));

  try {
    const r = run(`
import assert from "node:assert/strict";
import { loadPromptLibrary } from "./src/core/parser.ts";

const library = loadPromptLibrary(${JSON.stringify(root)});
assert.equal(library.packs.length, 1);
assert.equal(library.packs[0].items[0].title, "Note");
`);
    assert.equal(r.status, 0, r.stderr || r.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("directory pack and regular .md files coexist", () => {
  const root = mkdtempSync(join(tmpdir(), "promptbar-dirpack-"));
  writeFileSync(join(root, "standalone.md"), [
    "---", "tags: []", "aliases: []", "favorite: false", "---",
    "", "# Standalone", "", "## Hello", "World"
  ].join("\n"));
  const packDir = join(root, "tools");
  mkdirSync(packDir, { recursive: true });
  writeFileSync(join(packDir, "_pack.yaml"), "name: Tools\n");
  writeFileSync(join(packDir, "lint.md"), "Run linter.\n");

  try {
    const r = run(`
import assert from "node:assert/strict";
import { loadPromptLibrary } from "./src/core/parser.ts";

const library = loadPromptLibrary(${JSON.stringify(root)});
assert.equal(library.packs.length, 2);
const names = library.packs.map(p => p.name).sort();
assert.deepEqual(names, ["Standalone", "Tools"]);
`);
    assert.equal(r.status, 0, r.stderr || r.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("directory pack manager save persists metadata, renames prompt files, creates new prompt files, and removes deleted ones", () => {
  const root = mkdtempSync(join(tmpdir(), "promptbar-dirpack-save-"));
  const packDir = join(root, "tools");
  mkdirSync(packDir, { recursive: true });
  writeFileSync(
    join(packDir, "_pack.yaml"),
    [
      'name: "Tools"',
      "favorite: false",
      'tags: ["old-tag"]',
      'aliases: ["old-alias"]'
    ].join("\n")
  );
  writeFileSync(join(packDir, "existing.md"), "Existing body.\n");
  writeFileSync(join(packDir, "remove-me.md"), "Remove me.\n");

  try {
    const r = run(`
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadPromptLibrary } from "./src/core/parser.ts";
import { savePromptFile } from "./src/main/prompt-store.ts";

const root = ${JSON.stringify(root)};
const library = loadPromptLibrary(root);
const pack = library.packs.find((entry) => entry.name === "Tools");
assert.ok(pack, "directory pack should load before save");
assert.equal(pack.items.length, 2);

const existingPrompt = pack.items.find((item) => item.title === "existing");
assert.ok(existingPrompt, "existing prompt should exist");

savePromptFile(root, {
  sourceFile: pack.sourceFile,
  packs: [
    {
      ...pack,
      name: "Tools Updated",
      metadata: {
        favorite: true,
        tags: ["alpha"],
        aliases: ["beta"],
        output: "clipboard"
      },
      items: [
        {
          ...existingPrompt,
          title: "Renamed Prompt",
          body: "Updated body."
        },
        {
          id: pack.id + ":new-prompt",
          packId: pack.id,
          title: "New Prompt",
          body: "New prompt body.",
          description: "",
          favorite: true,
          tags: ["alpha"],
          aliases: ["beta"],
          variables: [],
          sourceFile: pack.sourceFile,
          output: "clipboard"
        }
      ]
    }
  ]
});

const files = readdirSync(join(root, "tools")).sort();
assert.deepEqual(files, ["New Prompt.md", "Renamed Prompt.md", "_pack.yaml"]);
assert.equal(existsSync(join(root, "tools", "existing.md")), false);
assert.equal(existsSync(join(root, "tools", "remove-me.md")), false);

const reloaded = loadPromptLibrary(root);
const savedPack = reloaded.packs.find((entry) => entry.name === "Tools Updated");
assert.ok(savedPack, "saved directory pack should reload");
assert.equal(savedPack.metadata.favorite, true);
assert.deepEqual(savedPack.metadata.tags, ["alpha"]);
assert.deepEqual(savedPack.metadata.aliases, ["beta"]);
assert.equal(savedPack.metadata.output, "clipboard");
assert.deepEqual(savedPack.items.map((item) => item.title).sort(), ["New Prompt", "Renamed Prompt"]);
assert.equal(savedPack.items.find((item) => item.title === "Renamed Prompt")?.body, "Updated body.");
assert.equal(savedPack.items.find((item) => item.title === "New Prompt")?.body, "New prompt body.");
`);
    assert.equal(r.status, 0, r.stderr || r.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
