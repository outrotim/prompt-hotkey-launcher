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

test("native paste runs inside the PromptBar process via pasteCommandV", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { runNativePasteWithLoader } from "./src/main/native-paste.ts";

const events = [];

await runNativePasteWithLoader(() => ({
  pasteCommandV() {
    events.push("paste");
  }
}));

assert.deepEqual(events, ["paste"]);
`);

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("native paste fails fast when the loaded module does not expose pasteCommandV", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { runNativePasteWithLoader } from "./src/main/native-paste.ts";

await assert.rejects(
  runNativePasteWithLoader(() => ({})),
  /pasteCommandV/
);
`);

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
