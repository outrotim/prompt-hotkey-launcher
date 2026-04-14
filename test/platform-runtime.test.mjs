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

test("platform runtime hides the app on darwin when no auxiliary windows are visible", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { createPlatformRuntimeAdapter } from "./src/main/platform-runtime.ts";

let hidden = 0;
const adapter = createPlatformRuntimeAdapter({
  app: {
    hide() {
      hidden += 1;
    }
  },
  platform: "darwin",
  getManagerWindow: () => null,
  getSettingsWindow: () => null
});

await adapter.restoreAppFocusAfterPromptSelection();
assert.equal(hidden, 1);
`);

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("platform runtime captures and restores focus on win32", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { createPlatformRuntimeAdapter } from "./src/main/platform-runtime.ts";

const calls = [];
const adapter = createPlatformRuntimeAdapter({
  app: {},
  platform: "win32",
  captureFocusTarget: async () => {
    calls.push("capture");
    return true;
  },
  restoreFocusTarget: async () => {
    calls.push("restore");
    return true;
  },
  getManagerWindow: () => null,
  getSettingsWindow: () => null
});

await adapter.captureFocusTargetBeforePromptDisplay();
await adapter.restoreAppFocusAfterPromptSelection();
assert.deepEqual(calls, ["capture", "restore"]);
`);

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("platform runtime skips win32 focus capture when an auxiliary window is visible", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { createPlatformRuntimeAdapter } from "./src/main/platform-runtime.ts";

let called = false;
const adapter = createPlatformRuntimeAdapter({
  app: {},
  platform: "win32",
  captureFocusTarget: async () => {
    called = true;
    return true;
  },
  getManagerWindow: () => ({
    isDestroyed: () => false,
    isVisible: () => true
  }),
  getSettingsWindow: () => null
});

await adapter.captureFocusTargetBeforePromptDisplay();
assert.equal(called, false);
`);

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
