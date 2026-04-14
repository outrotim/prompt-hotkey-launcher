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

test("prompt selection records usage after a successful paste", () => {
  const script = `
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

const calls = [];
const result = await executePromptSelection({
  prompt: {
    id: "prompt-1",
    packId: "pack-1",
    title: "标题",
    body: "Hello {{name}}",
    description: "",
    favorite: false,
    tags: [],
    aliases: [],
    variables: [],
    sourceFile: "/tmp/example.md"
  },
  variables: { name: "world" },
  popupWindow: { isDestroyed: () => false },
  renderPromptBody: (_prompt, vars) => "Hello " + vars.name,
  pasteText: async (text) => {
    calls.push(["paste", text]);
  },
  recordUsage: (record) => {
    calls.push(["record", record.promptId, record.values.name]);
  },
  hidePopupWindow: () => {
    calls.push(["hide"]);
  },
  restoreAppFocus: async () => {
    calls.push(["restore-focus"]);
  },
  showPopupWindow: () => {
    calls.push(["show"]);
  },
  notifyPopupOpened: () => {
    calls.push(["notify"]);
  },
  notifyClipboardFallback: (message) => {
    calls.push(["fallback", message]);
  },
  wait: async () => {
    calls.push(["wait"]);
  }
});

assert.deepEqual(result, {
  ok: true,
  renderedText: "Hello world",
  delivery: "default"
});
assert.deepEqual(calls, [
  ["hide"],
  ["restore-focus"],
  ["wait"],
  ["paste", "Hello world"],
  ["record", "prompt-1", "world"]
]);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("prompt selection reopens the popup and skips history when paste fails", () => {
  const script = `
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

const calls = [];
await assert.rejects(
  executePromptSelection({
    prompt: {
      id: "prompt-1",
      packId: "pack-1",
      title: "标题",
      body: "Hello",
      description: "",
      favorite: false,
      tags: [],
      aliases: [],
      variables: [],
      sourceFile: "/tmp/example.md"
    },
    variables: {},
    popupWindow: { isDestroyed: () => false },
    renderPromptBody: () => "Hello",
    pasteText: async () => {
      calls.push(["paste"]);
      throw new Error("paste failed");
    },
    recordUsage: () => {
      calls.push(["record"]);
    },
    hidePopupWindow: () => {
      calls.push(["hide"]);
    },
    restoreAppFocus: async () => {
      calls.push(["restore-focus"]);
    },
    showPopupWindow: () => {
      calls.push(["show"]);
    },
    notifyPopupOpened: () => {
      calls.push(["notify"]);
    },
    wait: async () => {
      calls.push(["wait"]);
    }
  }),
  /paste failed/
);

assert.deepEqual(calls, [
  ["hide"],
  ["restore-focus"],
  ["wait"],
  ["paste"],
  ["show"],
  ["notify"]
]);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("prompt selection falls back to clipboard when macOS blocks simulated paste", () => {
  const script = `
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

const calls = [];
const result = await executePromptSelection({
  prompt: {
    id: "prompt-1",
    packId: "pack-1",
    title: "标题",
    body: "Hello",
    description: "",
    favorite: false,
    tags: [],
    aliases: [],
    variables: [],
    sourceFile: "/tmp/example.md"
  },
  variables: {},
  popupWindow: { isDestroyed: () => false },
  renderPromptBody: () => "Hello",
  pasteText: async () => {
    calls.push(["paste"]);
    throw new Error("System Events 遇到一个错误：osascript 不允许发送按键。 (1002)");
  },
  writeClipboard: (text) => {
    calls.push(["clipboard", text]);
  },
  recordUsage: (record) => {
    calls.push(["record", record.promptId]);
  },
  hidePopupWindow: () => {
    calls.push(["hide"]);
  },
  restoreAppFocus: async () => {
    calls.push(["restore-focus"]);
  },
  showPopupWindow: () => {
    calls.push(["show"]);
  },
  notifyPopupOpened: () => {
    calls.push(["notify"]);
  },
  notifyClipboardFallback: (message) => {
    calls.push(["fallback", message]);
  },
  wait: async () => {
    calls.push(["wait"]);
  }
});

assert.deepEqual(result, {
  ok: true,
  renderedText: "Hello",
  delivery: "clipboard-fallback",
  message: "自动粘贴被系统拦住了。请检查 PromptBar 的辅助功能权限，以及自动化里的 System Events 授权。内容已复制到剪贴板，请手动粘贴一次。"
});

assert.deepEqual(calls, [
  ["hide"],
  ["restore-focus"],
  ["wait"],
  ["paste"],
  ["clipboard", "Hello"],
  ["record", "prompt-1"],
  ["fallback", "自动粘贴被系统拦住了。请检查 PromptBar 的辅助功能权限，以及自动化里的 System Events 授权。内容已复制到剪贴板，请手动粘贴一次。"]
]);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("prompt selection falls back to clipboard when Windows native paste fails after focus restore", () => {
  const script = `
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

const calls = [];
const result = await executePromptSelection({
  prompt: {
    id: "prompt-1",
    packId: "pack-1",
    title: "标题",
    body: "Hello",
    description: "",
    favorite: false,
    tags: [],
    aliases: [],
    variables: [],
    sourceFile: "/tmp/example.md"
  },
  variables: {},
  popupWindow: { isDestroyed: () => false },
  renderPromptBody: () => "Hello",
  pasteText: async () => {
    calls.push(["paste"]);
    throw new Error("Unable to send Ctrl+V through SendInput. (Win32 error 5)");
  },
  writeClipboard: (text) => {
    calls.push(["clipboard", text]);
  },
  recordUsage: (record) => {
    calls.push(["record", record.promptId]);
  },
  hidePopupWindow: () => {
    calls.push(["hide"]);
  },
  restoreAppFocus: async () => {
    calls.push(["restore-focus"]);
  },
  showPopupWindow: () => {
    calls.push(["show"]);
  },
  notifyPopupOpened: () => {
    calls.push(["notify"]);
  },
  notifyClipboardFallback: (message) => {
    calls.push(["fallback", message]);
  },
  wait: async () => {
    calls.push(["wait"]);
  }
});

assert.deepEqual(result, {
  ok: true,
  renderedText: "Hello",
  delivery: "clipboard-fallback",
  message: "自动粘贴被系统拦住了。请检查 PromptBar 的辅助功能权限，以及自动化里的 System Events 授权。内容已复制到剪贴板，请手动粘贴一次。"
});

assert.deepEqual(calls, [
  ["hide"],
  ["restore-focus"],
  ["wait"],
  ["paste"],
  ["clipboard", "Hello"],
  ["record", "prompt-1"],
  ["fallback", "自动粘贴被系统拦住了。请检查 PromptBar 的辅助功能权限，以及自动化里的 System Events 授权。内容已复制到剪贴板，请手动粘贴一次。"]
]);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("prompt selection can explicitly copy to clipboard without trying simulated paste", () => {
  const script = `
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

const calls = [];
const result = await executePromptSelection({
  prompt: {
    id: "prompt-1",
    packId: "pack-1",
    title: "标题",
    body: "Hello",
    description: "",
    favorite: false,
    tags: [],
    aliases: [],
    variables: [],
    sourceFile: "/tmp/example.md"
  },
  variables: {},
  deliveryMode: "clipboard",
  popupWindow: { isDestroyed: () => false },
  renderPromptBody: () => "Hello",
  pasteText: async () => {
    calls.push(["paste"]);
  },
  writeClipboard: (text) => {
    calls.push(["clipboard", text]);
  },
  recordUsage: (record) => {
    calls.push(["record", record.promptId]);
  },
  hidePopupWindow: () => {
    calls.push(["hide"]);
  },
  restoreAppFocus: async () => {
    calls.push(["restore-focus"]);
  },
  showPopupWindow: () => {
    calls.push(["show"]);
  },
  notifyPopupOpened: () => {
    calls.push(["notify"]);
  },
  wait: async () => {
    calls.push(["wait"]);
  }
});

assert.deepEqual(result, {
  ok: true,
  renderedText: "Hello",
  delivery: "clipboard-manual",
  message: "已复制到剪贴板，请手动粘贴一次。"
});

assert.deepEqual(calls, [
  ["hide"],
  ["restore-focus"],
  ["clipboard", "Hello"],
  ["record", "prompt-1"]
]);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("prompt selection emits diagnostic logs around focus handoff and paste", () => {
  const script = `
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

const infoLogs = [];
const warnLogs = [];
console.info = (...args) => { infoLogs.push(args.join(" ")); };
console.warn = (...args) => { warnLogs.push(args.join(" ")); };

await executePromptSelection({
  prompt: {
    id: "prompt-2",
    packId: "pack-2",
    title: "标题",
    body: "Hello",
    description: "",
    favorite: false,
    tags: [],
    aliases: [],
    variables: [],
    sourceFile: "/tmp/example.md"
  },
  variables: {},
  popupWindow: { isDestroyed: () => false },
  renderPromptBody: () => "Hello",
  pasteText: async () => {},
  recordUsage: () => {},
  hidePopupWindow: () => {},
  restoreAppFocus: async () => {},
  showPopupWindow: () => {},
  notifyPopupOpened: () => {},
  wait: async () => {}
});

assert.ok(infoLogs.some((line) => line.includes("[prompt-selection:start]")));
assert.ok(infoLogs.some((line) => line.includes("[prompt-selection:hidden]")));
assert.ok(infoLogs.some((line) => line.includes("[prompt-selection:focus-restored]")));
assert.ok(infoLogs.some((line) => line.includes("[prompt-selection:before-paste]")));
assert.ok(infoLogs.some((line) => line.includes("[prompt-selection:paste-success]")));
assert.ok(infoLogs.some((line) => line.includes("[prompt-selection:complete]")));
assert.equal(warnLogs.length, 0);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
