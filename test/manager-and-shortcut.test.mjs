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

test("draft prompt files avoid overwriting an existing slug by appending a numeric suffix", () => {
  const script = `
import assert from "node:assert/strict";
import { buildDraftPromptFilePath } from "./src/shared/prompt-files.ts";

const nextPath = buildDraftPromptFilePath(
  "/tmp/prompts",
  "中文 标题",
  [
    "/tmp/prompts/中文-标题.md",
    "/tmp/prompts/中文-标题-2.md"
  ]
);

assert.equal(nextPath, "/tmp/prompts/中文-标题-3.md");
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("initial view resolution prefers the query parameter and falls back safely to the hash", () => {
  const script = `
import assert from "node:assert/strict";
import { resolveInitialView } from "./src/renderer/src/view-mode.ts";

assert.equal(resolveInitialView("?view=manager", "#popup"), "manager");
assert.equal(resolveInitialView("", "#settings"), "settings");
assert.equal(resolveInitialView("?view=unknown", "#manager"), "popup");
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("prompt helper defaults keep Chinese-first pack and prompt drafts with stable ids", () => {
  const script = `
import assert from "node:assert/strict";
import {
  createDefaultMetadata,
  createPack,
  createPrompt,
  shouldUsePrimaryConfirmShortcut
} from "./src/renderer/src/prompt-helpers.ts";

const originalNow = Date.now;
Date.now = () => 1234;

const metadata = createDefaultMetadata();
assert.deepEqual(metadata, { favorite: false, tags: [], aliases: [] });

const pack = createPack("/tmp/prompts/中文合集.md", "新分组 1");
assert.equal(pack.name, "新分组 1");
assert.match(pack.id, /中文合集-新分组-1-1234/u);

const prompt = createPrompt(pack);
assert.equal(prompt.title, "新提示词 1");
assert.equal(prompt.body, "请在这里输入提示词正文。");
assert.match(prompt.id, /新提示词-1-1234/u);

assert.equal(shouldUsePrimaryConfirmShortcut("Enter", "", null), true);
assert.equal(shouldUsePrimaryConfirmShortcut("1", "", { variables: [] }), false);
assert.equal(shouldUsePrimaryConfirmShortcut("1", "has query", { variables: [] }), true);
assert.equal(shouldUsePrimaryConfirmShortcut("1", "", { variables: [{ key: "x" }] }), true);

Date.now = originalNow;
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("shortcut registration keeps the previous active hotkey when a replacement registration fails", () => {
  const script = `
import assert from "node:assert/strict";
import { createShortcutManagerCore } from "./src/main/shortcut-core.ts";

const events = [];
const registered = new Set();
const fakeApp = {
  on(event, listener) {
    events.push({ event, listener });
  }
};

const fakeGlobalShortcut = {
  register(accelerator) {
    if (accelerator === "Alt+Space") {
      return false;
    }
    registered.add(accelerator);
    return true;
  },
  unregister(accelerator) {
    registered.delete(accelerator);
  },
  unregisterAll() {
    registered.clear();
  }
};

const warnings = [];
const manager = createShortcutManagerCore(
  () => {},
  {
    app: fakeApp,
    globalShortcut: fakeGlobalShortcut,
    warn: (message) => warnings.push(message)
  }
);

const failedFirst = manager.register("Alt+Space");
assert.equal(failedFirst.registered, false);
assert.equal(failedFirst.activeHotkey, null);
assert.equal(manager.getActiveHotkey(), null);
assert.equal(manager.isRegistered(), false);
assert.deepEqual([...registered], []);

const first = manager.register("Control+Q");
assert.equal(first.registered, true);
assert.equal(first.activeHotkey, "Control+Q");
assert.equal(manager.getActiveHotkey(), "Control+Q");
assert.equal(manager.isRegistered(), true);
assert.deepEqual([...registered], ["Control+Q"]);

const second = manager.register("Alt+Space");
assert.equal(second.registered, false);
assert.equal(second.activeHotkey, "Control+Q");
assert.equal(manager.getActiveHotkey(), "Control+Q");
assert.equal(manager.isRegistered(), true);
assert.deepEqual([...registered], ["Control+Q"]);
assert.equal(warnings.length, 2);

events[0].listener();
assert.equal(registered.size, 0);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("reRegister unregisters and re-registers the active hotkey (power resume scenario)", () => {
  const script = `
import assert from "node:assert/strict";
import { createShortcutManagerCore } from "./src/main/shortcut-core.ts";

let registerCount = 0;
let unregisterCount = 0;
const registered = new Set();

const manager = createShortcutManagerCore(
  () => {},
  {
    app: { on() {} },
    globalShortcut: {
      register(accelerator) {
        registerCount++;
        registered.add(accelerator);
        return true;
      },
      unregister(accelerator) {
        unregisterCount++;
        registered.delete(accelerator);
      },
      unregisterAll() { registered.clear(); }
    },
    warn: () => {}
  }
);

manager.register("Control+Q");
assert.equal(registerCount, 1);

// Simulate power resume: reRegister should unregister then register again
const result = manager.reRegister();
assert.equal(result.registered, true);
assert.equal(result.activeHotkey, "Control+Q");
assert.equal(unregisterCount, 1, "must unregister before re-registering");
assert.equal(registerCount, 2, "must call register again");
assert.deepEqual([...registered], ["Control+Q"]);

// reRegister with no active hotkey should be a no-op
const manager2 = createShortcutManagerCore(
  () => {},
  {
    app: { on() {} },
    globalShortcut: {
      register() { return true; },
      unregister() {},
      unregisterAll() {}
    },
    warn: () => {}
  }
);
const noop = manager2.reRegister();
assert.equal(noop.registered, false);
assert.equal(noop.activeHotkey, null);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("settings update planning only re-registers hotkeys when the hotkey actually changes", () => {
  const script = `
import assert from "node:assert/strict";
import { createSettingsUpdatePlan } from "./src/main/settings-update.ts";

  const current = {
  hotkey: "Control+Q",
  launchAtLogin: false,
  locale: "en",
  packOrder: [],
  promptOrder: []
};

const localeOnly = createSettingsUpdatePlan(current, {
  locale: "zh-CN"
});
assert.equal(localeOnly.needsHotkeyRegistration, false);
assert.deepEqual(localeOnly.next, {
  hotkey: "Control+Q",
  launchAtLogin: false,
  locale: "zh-CN",
  packOrder: [],
  promptOrder: []
});

const launchAtLoginOnly = createSettingsUpdatePlan(current, {
  launchAtLogin: true
});
assert.equal(launchAtLoginOnly.needsHotkeyRegistration, false);
assert.deepEqual(launchAtLoginOnly.next, {
  hotkey: "Control+Q",
  launchAtLogin: true,
  locale: "en",
  packOrder: [],
  promptOrder: []
});

const packOrderOnly = createSettingsUpdatePlan(current, {
  packOrder: ["a::日常写作", "a::编程"]
});
assert.equal(packOrderOnly.needsHotkeyRegistration, false);
assert.deepEqual(packOrderOnly.next, {
  hotkey: "Control+Q",
  launchAtLogin: false,
  locale: "en",
  packOrder: ["a::日常写作", "a::编程"],
  promptOrder: []
});

const promptOrderOnly = createSettingsUpdatePlan(current, {
  promptOrder: ["prompt-3", "prompt-1"]
});
assert.equal(promptOrderOnly.needsHotkeyRegistration, false);
assert.deepEqual(promptOrderOnly.next, {
  hotkey: "Control+Q",
  launchAtLogin: false,
  locale: "en",
  packOrder: [],
  promptOrder: ["prompt-3", "prompt-1"]
});

const changedHotkey = createSettingsUpdatePlan(current, {
  hotkey: "Alt+Space"
});
assert.equal(changedHotkey.needsHotkeyRegistration, true);
assert.deepEqual(changedHotkey.next, {
  hotkey: "Alt+Space",
  launchAtLogin: false,
  locale: "en",
  packOrder: [],
  promptOrder: []
});

const unchangedHotkey = createSettingsUpdatePlan(current, {
  hotkey: "Control+Q"
});
assert.equal(unchangedHotkey.needsHotkeyRegistration, false);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("pack ordering applies default workflow priority and respects persisted custom order", () => {
  const script = `
import assert from "node:assert/strict";
import {
  buildPackOrderFromReplacement,
  getPromptPackOrderKey,
  supportsCrossFilePackMigration,
  movePackBetweenFiles,
  reorderPacks,
  sortPromptPacks
} from "./src/shared/pack-order.ts";
import {
  addDirtyPromptFiles,
  buildPromptFileSavePlan
} from "./src/renderer/src/manager-save.ts";

const packs = [
  {
    id: "2",
    name: "01 写作前阶段",
    sourceFile: "/tmp/a.md",
    metadata: { favorite: false, tags: [], aliases: [] },
    items: []
  },
  {
    id: "3",
    name: "常用工具",
    sourceFile: "/tmp/b.md",
    metadata: { favorite: false, tags: [], aliases: [] },
    items: []
  },
  {
    id: "1",
    name: "日常写作",
    sourceFile: "/tmp/a.md",
    metadata: { favorite: false, tags: [], aliases: [] },
    items: []
  },
  {
    id: "4",
    name: "研究画像",
    sourceFile: "/tmp/a.md",
    metadata: { favorite: false, tags: [], aliases: [] },
    items: []
  }
];

const defaultSorted = sortPromptPacks(packs);
assert.deepEqual(defaultSorted.map((pack) => pack.name), [
  "日常写作",
  "常用工具",
  "01 写作前阶段",
  "研究画像"
]);

const reorderedFilePacks = reorderPacks(
  defaultSorted.filter((pack) => pack.sourceFile === "/tmp/a.md"),
  2,
  1
);
assert.deepEqual(reorderedFilePacks.map((pack) => pack.name), [
  "日常写作",
  "研究画像",
  "01 写作前阶段"
]);

const persistedOrder = buildPackOrderFromReplacement(
  defaultSorted,
  "/tmp/a.md",
  reorderedFilePacks
);
assert.deepEqual(persistedOrder, [
  getPromptPackOrderKey(reorderedFilePacks[0]),
  getPromptPackOrderKey(reorderedFilePacks[1]),
  getPromptPackOrderKey(reorderedFilePacks[2]),
  getPromptPackOrderKey(defaultSorted[1])
]);

const persistedSorted = sortPromptPacks(packs, persistedOrder);
assert.deepEqual(persistedSorted.map((pack) => pack.name), [
  "日常写作",
  "研究画像",
  "01 写作前阶段",
  "常用工具"
]);

const crossFileReordered = reorderPacks(defaultSorted, 1, 3);
assert.deepEqual(crossFileReordered.map((pack) => pack.name), [
  "日常写作",
  "01 写作前阶段",
  "研究画像",
  "常用工具"
]);
assert.deepEqual(
  crossFileReordered.map((pack) => getPromptPackOrderKey(pack)),
  [
    "/tmp/a.md::日常写作",
    "/tmp/a.md::01 写作前阶段",
    "/tmp/a.md::研究画像",
    "/tmp/b.md::常用工具"
  ]
);

const migrated = movePackBetweenFiles(
  [
    {
      id: "pack-a",
      name: "写作前快启",
      sourceFile: "/tmp/a.md",
      metadata: { favorite: true, tags: ["source"], aliases: ["from-a"] },
      items: [
        {
          id: "prompt-1",
          packId: "pack-a",
          title: "Prompt",
          description: "",
          body: "",
          sourceFile: "/tmp/a.md",
          aliases: ["from-a"],
          tags: ["source"],
          favorite: true,
          variables: []
        }
      ]
    },
    {
      id: "pack-b",
      name: "修稿投稿快启",
      sourceFile: "/tmp/b.md",
      metadata: { favorite: false, tags: ["target"], aliases: ["from-b"] },
      items: []
    }
  ],
  "pack-a",
  "pack-b",
  "before"
);

assert.equal(migrated[0].sourceFile, "/tmp/b.md");
assert.equal(migrated[0].metadata.favorite, false);
assert.deepEqual(migrated[0].metadata.tags, ["target"]);
assert.deepEqual(migrated[0].metadata.aliases, ["from-b"]);
assert.equal(migrated[0].items[0].sourceFile, "/tmp/b.md");
assert.equal(migrated[0].items[0].favorite, false);
assert.deepEqual(migrated[0].items[0].tags, ["target"]);
assert.deepEqual(migrated[0].items[0].aliases, ["from-b"]);
assert.equal(supportsCrossFilePackMigration("/tmp/a.md", "/tmp/b.md"), true);
assert.equal(supportsCrossFilePackMigration("/tmp/a.md", "/tmp/tools/_pack.yaml"), false);
assert.equal(supportsCrossFilePackMigration("/tmp/tools/_pack.yaml", "/tmp/b.md"), false);

const migratedDirtyFiles = addDirtyPromptFiles([], "/tmp/a.md", "/tmp/b.md");
const migratedSavePlan = buildPromptFileSavePlan(migrated, migratedDirtyFiles);
assert.deepEqual(migratedSavePlan, [
  {
    sourceFile: "/tmp/a.md",
    packs: []
  },
  {
    sourceFile: "/tmp/b.md",
    packs: [
      {
        id: "pack-a",
        name: "写作前快启",
        sourceFile: "/tmp/b.md",
        metadata: { favorite: false, tags: ["target"], aliases: ["from-b"] },
        items: [
          {
            id: "prompt-1",
            packId: "pack-a",
            title: "Prompt",
            description: "",
            body: "",
            sourceFile: "/tmp/b.md",
            aliases: ["from-b"],
            tags: ["target"],
            favorite: false,
            variables: []
          }
        ]
      },
      {
        id: "pack-b",
        name: "修稿投稿快启",
        sourceFile: "/tmp/b.md",
        metadata: { favorite: false, tags: ["target"], aliases: ["from-b"] },
        items: []
      }
    ]
  }
]);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("prompt ordering gives manual order precedence over favorite and recent-use sorting", () => {
  const script = `
import assert from "node:assert/strict";
import {
  buildPromptOrderFromPacks,
  buildPromptOrderFromReplacement,
  getDropPlacement,
  movePromptBetweenPacks,
  reorderPrompts,
  resolveReorderTargetIndex,
  shouldSuppressDragClick,
  sortPromptItems
} from "./src/shared/prompt-order.ts";

const items = [
  {
    id: "prompt-1",
    packId: "pack-a",
    sourceFile: "/tmp/a.md",
    title: "最常用",
    favorite: true,
    useCount: 99,
    lastUsedAt: "2026-03-20T10:00:00.000Z"
  },
  {
    id: "prompt-2",
    packId: "pack-a",
    sourceFile: "/tmp/a.md",
    title: "第二个",
    favorite: false,
    useCount: 1,
    lastUsedAt: "2026-03-19T10:00:00.000Z"
  },
  {
    id: "prompt-3",
    packId: "pack-a",
    sourceFile: "/tmp/a.md",
    title: "第三个",
    favorite: false,
    useCount: 0,
    lastUsedAt: ""
  },
  {
    id: "prompt-4",
    packId: "pack-b",
    sourceFile: "/tmp/b.md",
    title: "跨分组",
    favorite: true,
    useCount: 5,
    lastUsedAt: "2026-03-18T10:00:00.000Z"
  }
];

const manualOrder = ["prompt-3", "prompt-2", "prompt-1", "prompt-4"];
assert.deepEqual(sortPromptItems(items, manualOrder).map((item) => item.id), manualOrder);

const reorderedPackItems = reorderPrompts(items.slice(0, 3), 2, 0);
assert.deepEqual(reorderedPackItems.map((item) => item.id), ["prompt-3", "prompt-1", "prompt-2"]);

const nextPromptOrder = buildPromptOrderFromReplacement(items, "pack-a", reorderedPackItems);
assert.deepEqual(nextPromptOrder, ["prompt-3", "prompt-1", "prompt-2", "prompt-4"]);

assert.deepEqual(
  buildPromptOrderFromPacks([
    { items: reorderedPackItems },
    { items: [items[3]] }
  ]),
  ["prompt-3", "prompt-1", "prompt-2", "prompt-4"]
);

const movedAcrossPacks = movePromptBetweenPacks(
  [
    { id: "pack-a", sourceFile: "/tmp/a.md", items: items.slice(0, 3) },
    { id: "pack-b", sourceFile: "/tmp/b.md", items: [items[3]] }
  ],
  "prompt-2",
  "pack-b",
  "prompt-4"
);

assert.deepEqual(movedAcrossPacks, [
  {
    id: "pack-a",
    sourceFile: "/tmp/a.md",
    items: [items[0], items[2]]
  },
  {
    id: "pack-b",
    sourceFile: "/tmp/b.md",
    items: [{ ...items[1], packId: "pack-b", sourceFile: "/tmp/b.md" }, items[3]]
  }
]);

const appendedAcrossPacks = movePromptBetweenPacks(
  [
    { id: "pack-a", sourceFile: "/tmp/a.md", items: items.slice(0, 3) },
    { id: "pack-b", sourceFile: "/tmp/b.md", items: [items[3]] }
  ],
  "prompt-1",
  "pack-b"
);

assert.deepEqual(appendedAcrossPacks, [
  {
    id: "pack-a",
    sourceFile: "/tmp/a.md",
    items: [items[1], items[2]]
  },
  {
    id: "pack-b",
    sourceFile: "/tmp/b.md",
    items: [items[3], { ...items[0], packId: "pack-b", sourceFile: "/tmp/b.md" }]
  }
]);

const movedToDifferentFilePack = movePromptBetweenPacks(
  [
    { id: "pack-a", sourceFile: "/tmp/a.md", items: items.slice(0, 3) },
    { id: "pack-b", sourceFile: "/tmp/b.md", items: [items[3]] },
    { id: "pack-c", sourceFile: "/tmp/c.md", items: [] }
  ],
  "prompt-3",
  "pack-c"
);

assert.deepEqual(movedToDifferentFilePack, [
  {
    id: "pack-a",
    sourceFile: "/tmp/a.md",
    items: [items[0], items[1]]
  },
  {
    id: "pack-b",
    sourceFile: "/tmp/b.md",
    items: [items[3]]
  },
  {
    id: "pack-c",
    sourceFile: "/tmp/c.md",
    items: [{ ...items[2], packId: "pack-c", sourceFile: "/tmp/c.md" }]
  }
]);

assert.equal(getDropPlacement(100, 40, 110), "before");
assert.equal(getDropPlacement(100, 40, 130), "after");
assert.equal(resolveReorderTargetIndex(1, 3, "before"), 2);
assert.equal(resolveReorderTargetIndex(1, 3, "after"), 3);
assert.equal(resolveReorderTargetIndex(3, 1, "before"), 1);
assert.equal(resolveReorderTargetIndex(3, 1, "after"), 2);
assert.equal(shouldSuppressDragClick(200, 199), true);
assert.equal(shouldSuppressDragClick(200, 200), false);
assert.equal(shouldSuppressDragClick(200, 260), false);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("dragend followed by an immediate click suppresses selection until the guard window expires", () => {
  const script = `
import assert from "node:assert/strict";
import { shouldSuppressDragClick } from "./src/shared/prompt-order.ts";

let now = 1_000;
let suppressUntil = 0;
let selected = 0;

const target = new EventTarget();

target.addEventListener("dragend", () => {
  suppressUntil = now + 180;
});

target.addEventListener("click", () => {
  if (shouldSuppressDragClick(suppressUntil, now)) {
    return;
  }

  selected += 1;
});

target.dispatchEvent(new Event("dragend"));
target.dispatchEvent(new Event("click"));
assert.equal(selected, 0);

now += 120;
target.dispatchEvent(new Event("click"));
assert.equal(selected, 0);

now += 80;
target.dispatchEvent(new Event("click"));
assert.equal(selected, 1);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("cross-file prompt moves mark both files dirty and require a two-file save plan", () => {
  const script = `
import assert from "node:assert/strict";
import { movePromptBetweenPacks } from "./src/shared/prompt-order.ts";
import {
  addDirtyPromptFiles,
  buildPromptFileSavePlan,
  buildReloadConfirmationMessage,
  removeDirtyPromptFiles
  ,
  shouldConfirmReloadMarkdown
} from "./src/renderer/src/manager-save.ts";

const packs = [
  {
    id: "pack-a",
    name: "A",
    sourceFile: "/tmp/a.md",
    metadata: { favorite: false, tags: [], aliases: [] },
    items: [
      { id: "prompt-1", packId: "pack-a", title: "One" },
      { id: "prompt-2", packId: "pack-a", title: "Two" }
    ]
  },
  {
    id: "pack-b",
    name: "B",
    sourceFile: "/tmp/b.md",
    metadata: { favorite: false, tags: [], aliases: [] },
    items: [
      { id: "prompt-3", packId: "pack-b", title: "Three" }
    ]
  }
];

const movedPacks = movePromptBetweenPacks(packs, "prompt-2", "pack-b");
const dirtyFiles = addDirtyPromptFiles([], "/tmp/a.md", "/tmp/b.md");

assert.deepEqual([...dirtyFiles], ["/tmp/a.md", "/tmp/b.md"]);

const savePlan = buildPromptFileSavePlan(movedPacks, dirtyFiles);
assert.deepEqual(savePlan, [
  {
    sourceFile: "/tmp/a.md",
    packs: [
      {
        id: "pack-a",
        name: "A",
        sourceFile: "/tmp/a.md",
        metadata: { favorite: false, tags: [], aliases: [] },
        items: [{ id: "prompt-1", packId: "pack-a", title: "One" }]
      }
    ]
  },
  {
    sourceFile: "/tmp/b.md",
    packs: [
      {
        id: "pack-b",
        name: "B",
        sourceFile: "/tmp/b.md",
        metadata: { favorite: false, tags: [], aliases: [] },
        items: [
          { id: "prompt-3", packId: "pack-b", title: "Three" },
          { id: "prompt-2", packId: "pack-b", title: "Two" }
        ]
      }
    ]
  }
]);

assert.deepEqual([...removeDirtyPromptFiles(dirtyFiles, "/tmp/a.md", "/tmp/b.md")], []);
assert.equal(shouldConfirmReloadMarkdown(new Set()), false);
assert.equal(shouldConfirmReloadMarkdown(new Set(["/tmp/a.md"])), true);
assert.match(
  buildReloadConfirmationMessage(new Set(["/tmp/a.md", "/tmp/b.md"]), (en) => en),
  /2 unsaved file changes/
);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("window configuration uses loadFile queries for packaged builds and keeps fullscreen workspace visibility flags", () => {
  const script = `
import assert from "node:assert/strict";
import { applyPromptBarActivationPolicy } from "./src/main/app-activation.ts";
import {
  getRendererViewTarget,
  getPopupWindowOptions,
  resolvePopupWindowStrategy,
  shouldHidePopupOnBlur,
  showPopupWindow,
  POPUP_ALWAYS_ON_TOP_LEVEL,
  POPUP_WORKSPACE_VISIBILITY_OPTIONS
} from "./src/main/window-config.ts";
import { readSafePopupWindowState } from "./src/main/popup-window-state.ts";

const packaged = getRendererViewTarget(undefined, "/tmp/out/main", "manager");
assert.equal(packaged.kind, "file");
assert.equal(packaged.target, "/tmp/out/renderer/index.html");
assert.deepEqual(packaged.query, { view: "manager" });

const dev = getRendererViewTarget("http://localhost:5173", "/tmp/out/main", "popup");
assert.equal(dev.kind, "url");
assert.equal(dev.target, "http://localhost:5173#popup");

assert.deepEqual(POPUP_WORKSPACE_VISIBILITY_OPTIONS, {
  visibleOnFullScreen: true
});
assert.equal(POPUP_ALWAYS_ON_TOP_LEVEL, "screen-saver");
assert.equal(resolvePopupWindowStrategy(undefined), "plain");
assert.equal(resolvePopupWindowStrategy("panel"), "panel");
assert.equal(resolvePopupWindowStrategy("unknown"), "plain");
assert.equal(shouldHidePopupOnBlur(null, 1000), false);
assert.equal(shouldHidePopupOnBlur(1000, 2000), false);

const plainOptions = getPopupWindowOptions("plain");
assert.equal(plainOptions.type, undefined);
assert.equal(plainOptions.transparent, undefined);
assert.equal(plainOptions.backgroundColor, "#0f172a");
assert.equal(plainOptions.frame, false);

const panelOptions = getPopupWindowOptions("panel");
assert.equal(panelOptions.type, "panel");
assert.equal(panelOptions.transparent, true);
assert.equal(panelOptions.vibrancy, "under-window");

const calls = [];
showPopupWindow({
  setVisibleOnAllWorkspaces: (...args) => calls.push(["setVisibleOnAllWorkspaces", ...args]),
  setAlwaysOnTop: (...args) => calls.push(["setAlwaysOnTop", ...args]),
  moveTop: () => calls.push(["moveTop"]),
  focus: () => calls.push(["focus"]),
  showInactive: () => calls.push(["showInactive"]),
  show: () => calls.push(["show"])
});

assert.deepEqual(calls, [
  ["setVisibleOnAllWorkspaces", true, POPUP_WORKSPACE_VISIBILITY_OPTIONS],
  ["setAlwaysOnTop", true, POPUP_ALWAYS_ON_TOP_LEVEL],
  ["show"],
  ["moveTop"],
  ["focus"]
]);

const destroyedWindow = {
  isDestroyed: () => true,
  isVisible: () => { throw new Error("Object has been destroyed"); },
  isFocused: () => { throw new Error("Object has been destroyed"); },
  getBounds: () => { throw new Error("Object has been destroyed"); }
};

assert.deepEqual(readSafePopupWindowState(destroyedWindow, { includeBounds: true }), {
  visible: "unavailable",
  focused: "unavailable",
  destroyed: true,
  bounds: "unavailable"
});

const activationCalls = [];
assert.equal(
  applyPromptBarActivationPolicy(
    {
      setActivationPolicy: (policy) => activationCalls.push(policy)
    },
    "darwin"
  ),
  true
);
assert.deepEqual(activationCalls, ["accessory"]);

const skippedCalls = [];
assert.equal(
  applyPromptBarActivationPolicy(
    {
      setActivationPolicy: (policy) => skippedCalls.push(policy)
    },
    "linux"
  ),
  false
);
assert.deepEqual(skippedCalls, []);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("message catalog exposes the shared bilingual strings used by settings and manager views", () => {
  const script = `
import assert from "node:assert/strict";
import { createTranslator, messages } from "./src/shared/messages.ts";

const zh = createTranslator("zh-CN");
const en = createTranslator("en");

assert.equal(en(messages.saveCurrentFile), "Save Current File");
assert.equal(zh(messages.saveCurrentFile), "保存当前文件");
assert.equal(en(messages.openSettings), "Open Settings");
assert.equal(zh(messages.fileTags), "文件标签");
assert.equal(zh(messages.fileAliases), "文件别名");
assert.equal(zh(messages.markFileAsFavorite), "将文件标记为收藏");
assert.equal(zh(messages.packName), "分组名称");
assert.equal(zh(messages.promptTitle), "提示词标题");
assert.equal(zh(messages.promptBody), "提示词正文");
assert.equal(zh(messages.none), "无");
assert.equal(zh(messages.launchAtLoginEnabled), "PromptBar 将在登录时自动启动。");
assert.equal(zh(messages.launchAtLoginUpdateFailed), "更新登录启动设置失败。");
assert.equal(zh(messages.interfaceLanguageSwitchedToEnglish), "界面语言已切换为英文。");
assert.match(en(messages.autoPastePermissionHelp), /Accessibility/);
assert.match(en(messages.autoPastePermissionHelp), /System Events/);
assert.match(zh(messages.autoPastePermissionHelp), /辅助功能/u);
assert.match(zh(messages.autoPastePermissionHelp), /System Events/);
assert.match(zh(messages.autoPasteFallbackMessage), /辅助功能/u);
assert.match(zh(messages.autoPasteFallbackMessage), /System Events/);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("manager hover can reset to keyboard-first until the pointer moves again", () => {
  const script = `
import assert from "node:assert/strict";
import { getNextPopupPointerHoverState } from "./src/renderer/src/popup-navigation.ts";

let hoverEnabled = true;

hoverEnabled = getNextPopupPointerHoverState(hoverEnabled, "popup-opened");
assert.equal(hoverEnabled, false);

hoverEnabled = getNextPopupPointerHoverState(hoverEnabled, "pointer-moved");
assert.equal(hoverEnabled, true);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("popup navigation helpers move between packs only when search mode is inactive", () => {
  const script = `
import assert from "node:assert/strict";
import {
  getNextPackSelection,
  shouldHandlePackNavigation
} from "./src/renderer/src/popup-navigation.ts";

const packs = [{ id: "a" }, { id: "b" }, { id: "c" }];

assert.equal(shouldHandlePackNavigation("ArrowRight", false), true);
assert.equal(shouldHandlePackNavigation("ArrowLeft", false), true);
assert.equal(shouldHandlePackNavigation("ArrowRight", true), false);
assert.equal(shouldHandlePackNavigation("ArrowDown", false), false);

assert.equal(getNextPackSelection("a", packs, "right"), "b");
assert.equal(getNextPackSelection("b", packs, "left"), "a");
assert.equal(getNextPackSelection("c", packs, "right"), "c");
assert.equal(getNextPackSelection(null, packs, "right"), "a");
assert.equal(getNextPackSelection(null, packs, "left"), "a");
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("tray configuration resolves the template icon path and menu spec without reading source text", () => {
  const script = `
import assert from "node:assert/strict";
import {
  buildTrayMenuSpec,
  resolveTrayAssetPath,
  shouldUseTemplateTrayImage
} from "./src/main/tray-config.ts";

assert.equal(
  resolveTrayAssetPath(false, "/Applications/PromptBar.app/Contents/Resources", "/tmp/promptbar", "darwin"),
  "/tmp/promptbar/resources/TrayTemplate.png"
);
assert.equal(
  resolveTrayAssetPath(true, "/Applications/PromptBar.app/Contents/Resources", "/tmp/promptbar", "darwin"),
  "/Applications/PromptBar.app/Contents/Resources/TrayTemplate.png"
);
assert.equal(
  resolveTrayAssetPath(false, "C:/Program Files/PromptBar/resources", "C:/repo/promptbar", "win32"),
  "C:/repo/promptbar/resources/app-icon.ico"
);
assert.equal(
  resolveTrayAssetPath(true, "C:/Program Files/PromptBar/resources", "C:/repo/promptbar", "win32"),
  "C:/Program Files/PromptBar/resources/app-icon.ico"
);
assert.equal(shouldUseTemplateTrayImage("darwin"), true);
assert.equal(shouldUseTemplateTrayImage("win32"), false);

const spec = buildTrayMenuSpec(true);
assert.deepEqual(spec.map((item) => item.type === "separator" ? "separator" : item.label), [
  "Toggle PromptBar",
  "Open Manager",
  "Open Settings",
  "separator",
  "Launch at Login",
  "separator",
  "Quit PromptBar"
]);
assert.equal(spec[4].type, "checkbox");
assert.equal(spec[4].checked, true);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
