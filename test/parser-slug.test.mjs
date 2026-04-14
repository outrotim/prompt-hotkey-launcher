import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

test("parser keeps non-ASCII titles in generated ids instead of collapsing them to empty slugs", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "promptbar-parser-"));
  const markdownPath = join(tempDirectory, "中文示例.md");

  writeFileSync(
    markdownPath,
    `---
tags: [中文]
aliases: [示例]
favorite: true
---

# 论文工具

## 主线诊断
请诊断这篇论文的主线。

## 统计审查
请审查统计风险。
`,
    "utf8"
  );

  const script = `
import assert from "node:assert/strict";
import { parsePromptFile } from "./src/core/parser.ts";

const packs = parsePromptFile(${JSON.stringify(markdownPath)});
assert.equal(packs.length, 1);
assert.match(packs[0].id, /中文示例-论文工具/u);
assert.equal(packs[0].items.length, 2);
assert.match(packs[0].items[0].id, /主线诊断/u);
assert.match(packs[0].items[1].id, /统计审查/u);
assert.notEqual(packs[0].items[0].id, packs[0].items[1].id);
`;

  const result = spawnSync(
    "node",
    ["--experimental-strip-types", "--experimental-specifier-resolution=node", "--input-type=module", "-e", script],
    {
      cwd: "/Users/haoruijinlin/VItalDB/prompt-hotkey-launcher",
      encoding: "utf8"
    }
  );

  rmSync(tempDirectory, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
