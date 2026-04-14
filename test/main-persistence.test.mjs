import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
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

test("settings and history stores write valid JSON atomically without leaving temp files behind", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-persistence-"));
  const settingsPath = join(fixtureRoot, "settings.json");
  const historyPath = join(fixtureRoot, "history.json");

  const script = `
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createSettingsStore } from "./src/main/settings.ts";
import { createHistoryStore } from "./src/main/history.ts";

const settingsStore = createSettingsStore(${JSON.stringify(settingsPath)});
const nextSettings = settingsStore.updateSettings({
  hotkey: "Alt+Space",
  launchAtLogin: true,
  locale: "zh-CN",
  packOrder: ["a::日常写作", "a::编程"],
  promptOrder: ["prompt-3", "prompt-1", "prompt-2"]
});
assert.equal(nextSettings.hotkey, "Alt+Space");
assert.equal(nextSettings.launchAtLogin, true);
assert.equal(nextSettings.locale, "zh-CN");
assert.deepEqual(nextSettings.packOrder, ["a::日常写作", "a::编程"]);
assert.deepEqual(nextSettings.promptOrder, ["prompt-3", "prompt-1", "prompt-2"]);
assert.deepEqual(JSON.parse(readFileSync(${JSON.stringify(settingsPath)}, "utf8")), nextSettings);
assert.equal(existsSync(${JSON.stringify(`${settingsPath}.tmp`)}), false);

const historyStore = createHistoryStore(${JSON.stringify(historyPath)});
historyStore.recordUsage({
  promptId: "prompt-1",
  usedAt: "2026-03-19T00:00:00.000Z",
  values: { topic: "test" }
});
await historyStore.flush();
const historyRecords = JSON.parse(readFileSync(${JSON.stringify(historyPath)}, "utf8"));
assert.equal(historyRecords.length, 1);
assert.equal(historyRecords[0].promptId, "prompt-1");
assert.equal(historyRecords[0].values.topic, "test");
assert.equal(existsSync(${JSON.stringify(`${historyPath}.tmp`)}), false);
historyStore.dispose();
`;

  try {
    const result = runTypeScriptCheck(script);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(existsSync(`${settingsPath}.tmp`), false);
    assert.equal(existsSync(`${historyPath}.tmp`), false);
    assert.deepEqual(JSON.parse(readFileSync(settingsPath, "utf8")), {
      hotkey: "Alt+Space",
      launchAtLogin: true,
      locale: "zh-CN",
      packOrder: ["a::日常写作", "a::编程"],
      promptOrder: ["prompt-3", "prompt-1", "prompt-2"],
      customPromptsDirectory: "",
      settingsSectionOrder: []
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("history store caches records in memory and annotates prompts immediately before async disk flush completes", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-history-cache-"));
  const historyPath = join(fixtureRoot, "history.json");

  try {
    const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { createHistoryStoreWithFileSystem } from "./src/main/history.ts";

let readCount = 0;
let persistedRecords = [
  {
    promptId: "prompt-1",
    usedAt: "2026-03-19T02:00:00.000Z",
    values: { tone: "formal" }
  },
  {
    promptId: "prompt-1",
    usedAt: "2026-03-19T01:00:00.000Z",
    values: { tone: "warm" }
  },
  {
    promptId: "prompt-2",
    usedAt: "2026-03-18T23:00:00.000Z",
    values: { topic: "study" }
  }
];
let releaseWrite;

const historyStore = createHistoryStoreWithFileSystem(
  ${JSON.stringify(historyPath)},
  {
    existsSync: () => true,
    mkdirSync: () => {},
    readFileSync: () => {
      readCount += 1;
      return JSON.stringify(persistedRecords, null, 2);
    },
    renameSync: () => {},
    unlinkSync: () => {},
    writeFileSync: (_path, raw) => {
      persistedRecords = JSON.parse(String(raw));
    }
  },
  {
    asyncFileSystem: {
      mkdir: async () => {},
      writeFile: async (_path, raw) => {
        await new Promise((resolve) => {
          releaseWrite = () => {
            persistedRecords = JSON.parse(String(raw));
            resolve(undefined);
          };
        });
      },
      rename: async () => {}
    }
  }
);

const items = [
  {
    id: "prompt-1",
    packId: "pack-a",
    title: "一",
    body: "",
    description: "",
    favorite: false,
    tags: [],
    aliases: [],
    variables: [],
    sourceFile: "/tmp/a.md"
  },
  {
    id: "prompt-2",
    packId: "pack-a",
    title: "二",
    body: "",
    description: "",
    favorite: false,
    tags: [],
    aliases: [],
    variables: [],
    sourceFile: "/tmp/a.md"
  }
];

const first = historyStore.annotatePrompts(items);
const second = historyStore.annotatePrompts(items);

assert.equal(readCount, 1);
assert.equal(first[0].useCount, 2);
assert.equal(first[0].lastUsedAt, "2026-03-19T02:00:00.000Z");
assert.deepEqual(first[0].lastValues, { tone: "formal" });
assert.equal(first[1].useCount, 1);
assert.deepEqual(second[0].lastValues, { tone: "formal" });

historyStore.recordUsage({
  promptId: "prompt-2",
  usedAt: "2026-03-19T03:00:00.000Z",
  values: { topic: "updated" }
});

const third = historyStore.annotatePrompts(items);
assert.equal(readCount, 1);
assert.equal(third[1].useCount, 2);
assert.equal(third[1].lastUsedAt, "2026-03-19T03:00:00.000Z");
assert.deepEqual(third[1].lastValues, { topic: "updated" });
assert.equal(persistedRecords[0].promptId, "prompt-1");

await new Promise((resolve) => setTimeout(resolve, 0));
releaseWrite();
await historyStore.flush();
assert.equal(persistedRecords[0].promptId, "prompt-2");

historyStore.dispose();
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("history store invalidates cached records after watcher-notified external changes and disposes cleanly", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-history-watch-"));
  const historyPath = join(fixtureRoot, "history.json");

  try {
    const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { createHistoryStoreWithFileSystem } from "./src/main/history.ts";

let invalidate;
let closed = false;
let readCount = 0;
let persistedRecords = [
  {
    promptId: "prompt-1",
    usedAt: "2026-03-19T01:00:00.000Z",
    values: { tone: "warm" }
  }
];

const historyStore = createHistoryStoreWithFileSystem(
  ${JSON.stringify(historyPath)},
  {
    existsSync: () => true,
    mkdirSync: () => {},
    readFileSync: () => {
      readCount += 1;
      return JSON.stringify(persistedRecords, null, 2);
    },
    renameSync: () => {},
    unlinkSync: () => {},
    writeFileSync: (_path, raw) => {
      persistedRecords = JSON.parse(String(raw));
    }
  },
  {
    watchHistoryFile: (_filePath, nextInvalidate) => {
      invalidate = nextInvalidate;
      return {
        close: () => {
          closed = true;
        }
      };
    }
  }
);

const items = [
  {
    id: "prompt-1",
    packId: "pack-a",
    title: "一",
    body: "",
    description: "",
    favorite: false,
    tags: [],
    aliases: [],
    variables: [],
    sourceFile: "/tmp/a.md"
  }
];

const first = historyStore.annotatePrompts(items);
assert.equal(first[0].lastUsedAt, "2026-03-19T01:00:00.000Z");
assert.equal(readCount, 1);

persistedRecords = [
  {
    promptId: "prompt-1",
    usedAt: "2026-03-19T04:00:00.000Z",
    values: { tone: "updated" }
  }
];
invalidate();

const second = historyStore.annotatePrompts(items);
assert.equal(readCount, 2);
assert.equal(second[0].lastUsedAt, "2026-03-19T04:00:00.000Z");
assert.deepEqual(second[0].lastValues, { tone: "updated" });

historyStore.dispose();
assert.equal(closed, true);
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("history store drops a stale pending write after external invalidation instead of overwriting newer disk content", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-history-race-"));
  const historyPath = join(fixtureRoot, "history.json");

  try {
    const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { createHistoryStoreWithFileSystem } from "./src/main/history.ts";

let invalidate;
let persistedRecords = [
  {
    promptId: "prompt-1",
    usedAt: "2026-03-19T01:00:00.000Z",
    values: { tone: "warm" }
  }
];
let releaseWrite;
let unlinkCount = 0;
let pendingTempRecords = null;

const historyStore = createHistoryStoreWithFileSystem(
  ${JSON.stringify(historyPath)},
  {
    existsSync: () => true,
    mkdirSync: () => {},
    readFileSync: () => JSON.stringify(persistedRecords, null, 2),
    renameSync: () => {},
    unlinkSync: () => {},
    writeFileSync: () => {}
  },
  {
    asyncFileSystem: {
      mkdir: async () => {},
      writeFile: async (_path, raw) => {
        await new Promise((resolve) => {
          releaseWrite = () => {
            pendingTempRecords = JSON.parse(String(raw));
            resolve(undefined);
          };
        });
      },
      rename: async () => {
        persistedRecords = pendingTempRecords;
        pendingTempRecords = null;
      },
      unlink: async () => {
        unlinkCount += 1;
        pendingTempRecords = null;
      }
    },
    watchHistoryFile: (_filePath, nextInvalidate) => {
      invalidate = nextInvalidate;
      return {
        close: () => {}
      };
    }
  }
);

historyStore.recordUsage({
  promptId: "prompt-2",
  usedAt: "2026-03-19T02:00:00.000Z",
  values: { topic: "queued" }
});

await new Promise((resolve) => setTimeout(resolve, 0));
persistedRecords = [
  {
    promptId: "prompt-external",
    usedAt: "2026-03-19T03:00:00.000Z",
    values: { topic: "external" }
  }
];
invalidate();

releaseWrite();
await historyStore.flush();

assert.equal(unlinkCount, 1);
assert.equal(persistedRecords[0].promptId, "prompt-external");

const annotated = historyStore.annotatePrompts([
  {
    id: "prompt-external",
    packId: "pack-a",
    title: "外部",
    body: "",
    description: "",
    favorite: false,
    tags: [],
    aliases: [],
    variables: [],
    sourceFile: "/tmp/a.md"
  }
]);

assert.equal(annotated[0].useCount, 1);
assert.equal(annotated[0].lastUsedAt, "2026-03-19T03:00:00.000Z");
`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("default history async unlink waits for cleanup before reporting completion", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { createDefaultHistoryAsyncFileSystem } from "./src/main/history.ts";

let unlinkStarted = false;
let unlinkFinished = false;
let releaseUnlink;

const asyncFileSystem = createDefaultHistoryAsyncFileSystem(
  {
    existsSync: () => false,
    mkdirSync: () => {},
    readFileSync: () => "[]",
    renameSync: () => {},
    unlinkSync: () => {},
    writeFileSync: () => {}
  },
  {
    unlink: async () => {
      unlinkStarted = true;
      await new Promise((resolve) => {
        releaseUnlink = () => {
          unlinkFinished = true;
          resolve(undefined);
        };
      });
    }
  }
);

let resolved = false;
const unlinkPromise = asyncFileSystem.unlink("/tmp/promptbar-history.tmp").then(() => {
  resolved = true;
});

await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(unlinkStarted, true);
assert.equal(resolved, false);
assert.equal(unlinkFinished, false);

releaseUnlink();
await unlinkPromise;

assert.equal(resolved, true);
assert.equal(unlinkFinished, true);
`);

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
