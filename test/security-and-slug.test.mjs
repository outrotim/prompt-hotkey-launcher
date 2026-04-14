import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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

test("prompt path validation accepts markdown files under the prompts directory and rejects traversal", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-prompts-"));
  const root = join(fixtureRoot, "prompts");
  const nestedDirectory = join(root, "folder");
  mkdirSync(nestedDirectory, { recursive: true });

  const script = `
import assert from "node:assert/strict";
import { assertPromptFilePath } from "./src/main/prompt-path.ts";

const root = ${JSON.stringify(root)};
assert.equal(
  assertPromptFilePath(root, ${JSON.stringify(join(nestedDirectory, "example.md"))}),
  ${JSON.stringify(join(nestedDirectory, "example.md"))}
);
assert.throws(() => assertPromptFilePath(root, ${JSON.stringify(join(root, "..", "..", "etc", "passwd"))}));
assert.throws(() => assertPromptFilePath(root, ${JSON.stringify(join(root, "example.txt"))}));
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("prompt file guards reject symlink escapes for path validation, save, and open-source flows", () => {
  const script = `
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { assertPromptFilePath } from "./src/main/prompt-path.ts";

const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-symlink-"));
const promptsDirectory = join(fixtureRoot, "prompts");
const outsideDirectory = join(fixtureRoot, "outside");
mkdirSync(promptsDirectory, { recursive: true });
mkdirSync(outsideDirectory, { recursive: true });

const outsideFile = join(outsideDirectory, "outside.md");
writeFileSync(outsideFile, "# 外部文件\\n");

const insideSymlink = join(promptsDirectory, "inside.md");
symlinkSync(outsideFile, insideSymlink);

assert.throws(
  () => assertPromptFilePath(promptsDirectory, insideSymlink),
  /symbolic link|resolves outside/
);

assert.throws(
  () => {
    const validatedPath = assertPromptFilePath(promptsDirectory, insideSymlink);
    writeFileSync(validatedPath, "# should not write\\n");
  },
  /symbolic link|resolves outside/
);

const openSourceFlow = (candidatePath) => assertPromptFilePath(promptsDirectory, candidatePath);
assert.throws(() => openSourceFlow(insideSymlink), /symbolic link|resolves outside/);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("shared slugify keeps Unicode titles stable for renderer and parser usage", () => {
  const script = `
import assert from "node:assert/strict";
import { slugify } from "./src/shared/slugify.ts";

assert.equal(slugify(" 中文 标题 "), "中文-标题");
assert.equal(slugify("Prompt 标题 2026"), "prompt-标题-2026");
assert.equal(slugify("！！！"), "item");
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("template rendering keeps explicit empty-string values instead of falling back to defaults", () => {
  const script = `
import assert from "node:assert/strict";
import { renderPromptBody } from "./src/core/template.ts";

const prompt = {
  id: "p1",
  packId: "pack-1",
  title: "Title",
  body: "A={{ name|fallback }}; B={{ other|default }}",
  description: "",
  favorite: false,
  tags: [],
  aliases: [],
  variables: [],
  sourceFile: "/tmp/example.md"
};

assert.equal(
  renderPromptBody(prompt, { name: "", other: "filled" }),
  "A=; B=filled"
);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("clipboard restore helper waits longer and avoids overwriting a newer clipboard value", () => {
  const script = `
import assert from "node:assert/strict";
import {
  CLIPBOARD_RESTORE_DELAY_MS,
  shouldRestorePreviousClipboard
} from "./src/main/paste-clipboard.ts";

assert.ok(CLIPBOARD_RESTORE_DELAY_MS >= 500);
assert.equal(shouldRestorePreviousClipboard("pasted text", "pasted text"), true);
assert.equal(shouldRestorePreviousClipboard("user copied something else", "pasted text"), false);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("openPath helper throws when Electron reports a non-empty error string", () => {
  const script = `
import assert from "node:assert/strict";
import { openPathOrThrow } from "./src/main/open-path.ts";

await assert.rejects(
  () => openPathOrThrow(async () => "The application cannot be opened.", "/tmp/example"),
  /Failed to open path: The application cannot be opened\\./
);

await assert.doesNotReject(
  () => openPathOrThrow(async () => "", "/tmp/example")
);
`;

  const result = runTypeScriptCheck(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("prompt file atomic writer leaves no temp file behind", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-save-atomic-"));
  const promptsDirectory = join(fixtureRoot, "prompts");
  const sourceFile = join(promptsDirectory, "nested", "example.md");
  mkdirSync(promptsDirectory, { recursive: true });

  const script = `
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { writeFileAtomically } from "./src/main/atomic-write.ts";

const sourceFile = ${JSON.stringify(sourceFile)};
writeFileAtomically(
  sourceFile,
  [
    "---",
    "tags: [测试]",
    "aliases: [示例]",
    "favorite: false",
    "---",
    "",
    "# 分组",
    "",
    "<!-- promptbar:id=prompt-1 -->",
    "## 提示词",
    "正文内容",
    ""
  ].join("\\n")
);

const saved = readFileSync(sourceFile, "utf8");
assert.match(saved, /# 分组/);
assert.match(saved, /## 提示词/);
assert.equal(existsSync(sourceFile + ".tmp"), false);
`;

  try {
    const result = runTypeScriptCheck(script);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(existsSync(`${sourceFile}.tmp`), false);
    assert.match(readFileSync(sourceFile, "utf8"), /# 分组/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
