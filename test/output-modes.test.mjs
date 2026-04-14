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

test("output: clipboard calls writeClipboard, not pasteText", () => {
  const r = run(`
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

const calls = [];
await executePromptSelection({
  prompt: { id: "p1", packId: "pk", title: "T", body: "Hello", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md", output: "clipboard" },
  variables: {},
  popupWindow: { isDestroyed: () => false },
  renderPromptBody: () => "Hello",
  pasteText: async () => { calls.push("paste"); },
  writeClipboard: (text) => { calls.push("clipboard:" + text); },
  recordUsage: () => {},
  hidePopupWindow: () => {},
  showPopupWindow: () => {},
  notifyPopupOpened: () => {},
  wait: async () => {}
});

assert.deepEqual(calls, ["clipboard:Hello"]);
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("output: file calls appendToFile with correct path and text", () => {
  const r = run(`
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

const calls = [];
await executePromptSelection({
  prompt: { id: "p1", packId: "pk", title: "T", body: "Content", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md", output: "file", outputFile: "/tmp/log.md" },
  variables: {},
  popupWindow: { isDestroyed: () => false },
  renderPromptBody: () => "Content",
  pasteText: async () => { calls.push("paste"); },
  appendToFile: (path, text) => { calls.push("file:" + path + ":" + text); },
  recordUsage: () => {},
  hidePopupWindow: () => {},
  showPopupWindow: () => {},
  notifyPopupOpened: () => {},
  wait: async () => {}
});

assert.deepEqual(calls, ["file:/tmp/log.md:Content\\n"]);
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("after: shell calls runShellCommand with rendered text", () => {
  const r = run(`
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

const calls = [];
await executePromptSelection({
  prompt: { id: "p1", packId: "pk", title: "T", body: "text", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md", after: { type: "shell", command: "echo hello" } },
  variables: {},
  popupWindow: { isDestroyed: () => false },
  renderPromptBody: () => "rendered text",
  pasteText: async () => {},
  recordUsage: () => {},
  hidePopupWindow: () => {},
  showPopupWindow: () => {},
  notifyPopupOpened: () => {},
  wait: async () => {},
  runShellCommand: (cmd, stdin) => { calls.push(cmd + "|" + stdin); }
});

assert.deepEqual(calls, ["echo hello|rendered text"]);
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("default output: paste calls pasteText", () => {
  const r = run(`
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

const calls = [];
await executePromptSelection({
  prompt: { id: "p1", packId: "pk", title: "T", body: "text", description: "", favorite: false, tags: [], aliases: [], variables: [], sourceFile: "/t.md" },
  variables: {},
  popupWindow: { isDestroyed: () => false },
  renderPromptBody: () => "text",
  pasteText: async (t) => { calls.push("paste:" + t); },
  recordUsage: () => {},
  hidePopupWindow: () => {},
  showPopupWindow: () => {},
  notifyPopupOpened: () => {},
  wait: async () => {}
});

assert.deepEqual(calls, ["paste:text"]);
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
