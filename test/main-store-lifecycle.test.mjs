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

test("store lifecycle manager flushes async stores in order and disposes all stores once", () => {
  const script = `
import assert from "node:assert/strict";
import { createStoreLifecycleManager } from "./src/main/store-lifecycle.ts";

const steps = [];
const manager = createStoreLifecycleManager([
  {
    name: "settings",
    dispose: () => {
      steps.push("settings:dispose");
    }
  },
  {
    name: "history",
    flush: async () => {
      steps.push("history:flush:start");
      await Promise.resolve();
      steps.push("history:flush:done");
    },
    dispose: () => {
      steps.push("history:dispose");
    }
  },
  {
    name: "promptLibrary",
    dispose: () => {
      steps.push("library:dispose");
    }
  }
]);

await manager.flushAll();
assert.deepEqual(steps, ["history:flush:start", "history:flush:done"]);

manager.disposeAll();
manager.disposeAll();
assert.deepEqual(steps, [
  "history:flush:start",
  "history:flush:done",
  "settings:dispose",
  "history:dispose",
  "library:dispose"
]);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("store lifecycle manager times out stuck flushes and continues disposing stores", () => {
  const script = `
import assert from "node:assert/strict";
import { createStoreLifecycleManager } from "./src/main/store-lifecycle.ts";

const steps = [];
const manager = createStoreLifecycleManager(
  [
    {
      name: "history",
      flush: async () => {
        steps.push("history:flush:start");
        await new Promise(() => {});
      },
      dispose: () => {
        steps.push("history:dispose");
      }
    },
    {
      name: "promptLibrary",
      dispose: () => {
        steps.push("library:dispose");
      }
    }
  ],
  {
    flushTimeoutMs: 10,
    onFlushTimeout: (store) => {
      steps.push("timeout:" + store.name);
    }
  }
);

await manager.flushAll();
manager.disposeAll();

assert.deepEqual(steps, [
  "history:flush:start",
  "timeout:history",
  "history:dispose",
  "library:dispose"
]);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
