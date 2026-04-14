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

// ── shouldRestorePreviousClipboard boundary cases ──────────────────────

test("clipboard restore: returns true when clipboard still contains the pasted text (happy path)", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { shouldRestorePreviousClipboard } from "./src/main/paste-clipboard.ts";

assert.equal(shouldRestorePreviousClipboard("pasted prompt text", "pasted prompt text"), true);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("clipboard restore: returns false when user has copied something else after paste", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { shouldRestorePreviousClipboard } from "./src/main/paste-clipboard.ts";

assert.equal(shouldRestorePreviousClipboard("user copied new content", "pasted prompt text"), false);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("clipboard restore: returns false when clipboard is empty after paste", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { shouldRestorePreviousClipboard } from "./src/main/paste-clipboard.ts";

assert.equal(shouldRestorePreviousClipboard("", "pasted prompt text"), false);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("clipboard restore: returns true for empty string pasted and clipboard still empty", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { shouldRestorePreviousClipboard } from "./src/main/paste-clipboard.ts";

assert.equal(shouldRestorePreviousClipboard("", ""), true);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("clipboard restore: handles unicode content correctly", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { shouldRestorePreviousClipboard } from "./src/main/paste-clipboard.ts";

const unicodeText = "你好世界 🌍 café naïve";
assert.equal(shouldRestorePreviousClipboard(unicodeText, unicodeText), true);
assert.equal(shouldRestorePreviousClipboard(unicodeText + " ", unicodeText), false);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("clipboard restore delay is at least 500ms to allow slow apps to consume the paste", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { CLIPBOARD_RESTORE_DELAY_MS } from "./src/main/paste-clipboard.ts";

assert.ok(CLIPBOARD_RESTORE_DELAY_MS >= 500, "delay must be >= 500ms for slow applications");
assert.ok(CLIPBOARD_RESTORE_DELAY_MS <= 2000, "delay should not be excessively long");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("pasteText prefers the native paste helper before AppleScript", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { pasteTextWithDependencies } from "./src/main/paste.ts";

let clipboardValue = "previous clipboard";
const events = [];

await pasteTextWithDependencies("prompt body", {
  readClipboard: () => clipboardValue,
  writeClipboard: (text) => {
    clipboardValue = text;
    events.push("write:" + text);
  },
  runNativePaste: async () => {
    events.push("native");
  },
  runAppleScript: async () => {
    events.push("apple");
  },
  wait: async () => {
    events.push("wait");
  }
});

assert.deepEqual(events, [
  "write:prompt body",
  "native",
  "wait",
  "write:previous clipboard"
]);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("pasteText falls back to AppleScript when the native helper is unavailable", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { pasteTextWithDependencies } from "./src/main/paste.ts";

let clipboardValue = "previous clipboard";
const events = [];

await pasteTextWithDependencies("prompt body", {
  readClipboard: () => clipboardValue,
  writeClipboard: (text) => {
    clipboardValue = text;
    events.push("write:" + text);
  },
  runNativePaste: async () => {
    events.push("native");
    throw new Error("Native paste helper is unavailable");
  },
  runAppleScript: async () => {
    events.push("apple");
  },
  wait: async () => {
    events.push("wait");
  }
});

assert.deepEqual(events, [
  "write:prompt body",
  "native",
  "apple",
  "wait",
  "write:previous clipboard"
]);
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

// ── prompt-selection integration with paste flow ───────────────────────

test("executePromptSelection waits the configured delay before pasting", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

const events = [];

await executePromptSelection({
  prompt: {
    id: "p1", packId: "pk1", title: "T", body: "Body",
    description: "", favorite: false, tags: [], aliases: [],
    variables: [], sourceFile: "/tmp/t.md"
  },
  variables: {},
  popupWindow: { isDestroyed: () => false },
  renderPromptBody: () => "Body",
  pasteText: async () => { events.push("paste"); },
  recordUsage: () => { events.push("record"); },
  hidePopupWindow: () => { events.push("hide"); },
  showPopupWindow: () => {},
  notifyPopupOpened: () => {},
  wait: async (ms) => { events.push("wait:" + ms); },
  delayMs: 120
});

assert.deepEqual(events, ["hide", "wait:120", "paste", "record"],
  "wait must happen before paste with the configured delay");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("executePromptSelection uses a safer default delay for app focus handoff before pasting", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

let capturedDelay = null;

await executePromptSelection({
  prompt: {
    id: "p1", packId: "pk1", title: "T", body: "Body",
    description: "", favorite: false, tags: [], aliases: [],
    variables: [], sourceFile: "/tmp/t.md"
  },
  variables: {},
  popupWindow: { isDestroyed: () => false },
  renderPromptBody: () => "Body",
  pasteText: async () => {},
  recordUsage: () => {},
  hidePopupWindow: () => {},
  showPopupWindow: () => {},
  notifyPopupOpened: () => {},
  wait: async (ms) => { capturedDelay = ms; }
});

assert.equal(capturedDelay, 180, "default delay should leave enough time for app focus handoff");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("when paste fails, popup is restored and no usage is recorded", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

const events = [];

await assert.rejects(
  executePromptSelection({
    prompt: {
      id: "p1", packId: "pk1", title: "T", body: "Body",
      description: "", favorite: false, tags: [], aliases: [],
      variables: [], sourceFile: "/tmp/t.md"
    },
    variables: {},
    popupWindow: { isDestroyed: () => false },
    renderPromptBody: () => "Body",
    pasteText: async () => { throw new Error("AppleScript failed"); },
    recordUsage: () => { events.push("record"); },
    hidePopupWindow: () => { events.push("hide"); },
    showPopupWindow: () => { events.push("show"); },
    notifyPopupOpened: () => { events.push("notify"); },
    wait: async () => {}
  }),
  /AppleScript failed/
);

assert.ok(!events.includes("record"), "usage must not be recorded when paste fails");
assert.ok(events.includes("show"), "popup must be shown again when paste fails");
assert.ok(events.includes("notify"), "popup:opened must be sent when paste fails");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("when paste fails but popup is destroyed, no attempt to show it", () => {
  const result = runTypeScriptCheck(`
import assert from "node:assert/strict";
import { executePromptSelection } from "./src/main/prompt-selection.ts";

const events = [];

await assert.rejects(
  executePromptSelection({
    prompt: {
      id: "p1", packId: "pk1", title: "T", body: "Body",
      description: "", favorite: false, tags: [], aliases: [],
      variables: [], sourceFile: "/tmp/t.md"
    },
    variables: {},
    popupWindow: { isDestroyed: () => true },
    renderPromptBody: () => "Body",
    pasteText: async () => { throw new Error("failed"); },
    recordUsage: () => { events.push("record"); },
    hidePopupWindow: () => { events.push("hide"); },
    showPopupWindow: () => { events.push("show"); },
    notifyPopupOpened: () => { events.push("notify"); },
    wait: async () => {}
  })
);

assert.ok(!events.includes("show"), "must not show destroyed window");
assert.ok(!events.includes("notify"), "must not notify on destroyed window");
`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
