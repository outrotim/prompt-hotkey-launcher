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

test("before-quit handler flushes history before disposing stores and only finalizes once", () => {
  const script = `
import assert from "node:assert/strict";
import { createBeforeQuitHandler } from "./src/main/shutdown.ts";

const steps = [];
let releaseFlush;
const handler = createBeforeQuitHandler({
  flushHistory: () =>
    new Promise((resolve) => {
      steps.push("flush:start");
      releaseFlush = () => {
        steps.push("flush:done");
        resolve(undefined);
      };
    }),
  disposeStores: () => {
    steps.push("dispose");
  },
  quitApp: () => {
    steps.push("quit");
  }
});

const firstEvent = {
  prevented: false,
  preventDefault() {
    this.prevented = true;
    steps.push("prevent");
  }
};

const firstRun = handler(firstEvent);
assert.equal(firstEvent.prevented, true);
assert.deepEqual(steps, ["prevent", "flush:start"]);

releaseFlush();
await firstRun;
assert.deepEqual(steps, ["prevent", "flush:start", "flush:done", "dispose", "quit"]);

const secondEvent = {
  prevented: false,
  preventDefault() {
    this.prevented = true;
    steps.push("prevent:again");
  }
};

await handler(secondEvent);
assert.equal(secondEvent.prevented, false);
assert.deepEqual(steps, ["prevent", "flush:start", "flush:done", "dispose", "quit"]);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
