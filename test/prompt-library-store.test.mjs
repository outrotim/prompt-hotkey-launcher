import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
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

test("prompt library store reuses async cached parses until markdown files change or cache is invalidated", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-library-store-"));
  const promptsDirectory = join(fixtureRoot, "prompts");

  mkdirSync(promptsDirectory, { recursive: true });

  const script = `
import assert from "node:assert/strict";
import { createPromptLibraryStore } from "./src/main/prompt-library-store.ts";

let loadCount = 0;
let invalidate;
let closed = false;
let resolveLoad;
const store = createPromptLibraryStore(${JSON.stringify(promptsDirectory)}, {
  loadPromptLibrary: async () => {
    loadCount += 1;
    return await new Promise((resolve) => {
      resolveLoad = () => {
        resolve({
          packs: [],
          items: [{ id: "prompt-" + loadCount }]
        });
      };
    });
  },
  watchPromptsDirectory: (_directory, nextInvalidate) => {
    invalidate = nextInvalidate;
    return {
      close: () => {
        closed = true;
      }
    };
  }
});

const firstPromise = store.getLibrary();
const secondPromise = store.getLibrary();
assert.equal(loadCount, 1);
resolveLoad();

const first = await firstPromise;
const second = await secondPromise;
assert.equal(first, second);

invalidate();
const thirdPromise = store.getLibrary();
assert.equal(loadCount, 2);
resolveLoad();
const third = await thirdPromise;
assert.notEqual(third, second);

store.invalidate();
const fourthPromise = store.getLibrary();
assert.equal(loadCount, 3);
resolveLoad();
const fourth = await fourthPromise;
assert.notEqual(fourth, third);

store.dispose();
assert.equal(closed, true);
`;

  try {
    const result = runTypeScriptCheck(script);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("prompt library store does not let an invalidated in-flight load overwrite newer cache state", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-library-race-"));
  const promptsDirectory = join(fixtureRoot, "prompts");

  mkdirSync(promptsDirectory, { recursive: true });

  const script = `
import assert from "node:assert/strict";
import { createPromptLibraryStore } from "./src/main/prompt-library-store.ts";

let invalidate;
let loadCount = 0;
const pendingResolves = [];
const store = createPromptLibraryStore(${JSON.stringify(promptsDirectory)}, {
  loadPromptLibrary: async () => {
    loadCount += 1;
    const currentLoad = loadCount;
    return await new Promise((resolve) => {
      pendingResolves.push(() => {
        resolve({
          packs: [],
          items: [{ id: "prompt-" + currentLoad }]
        });
      });
    });
  },
  watchPromptsDirectory: (_directory, nextInvalidate) => {
    invalidate = nextInvalidate;
    return {
      close: () => {}
    };
  }
});

const firstPromise = store.getLibrary();
assert.equal(loadCount, 1);

invalidate();

const secondPromise = store.getLibrary();
assert.equal(loadCount, 2);

pendingResolves[0]();
const firstResult = await firstPromise;
assert.equal(firstResult.items[0].id, "prompt-1");

const stillPendingSecond = store.getLibrary();
assert.equal(loadCount, 2);

pendingResolves[1]();
const secondResult = await secondPromise;
assert.equal(secondResult.items[0].id, "prompt-2");
const stillPendingSecondResult = await stillPendingSecond;
assert.equal(stillPendingSecondResult.items[0].id, "prompt-2");

const cached = await store.getLibrary();
assert.equal(cached.items[0].id, "prompt-2");
assert.equal(loadCount, 2);
`;

  try {
    const result = runTypeScriptCheck(script);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
