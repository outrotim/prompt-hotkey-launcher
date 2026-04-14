import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

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

test("startup prompt sync fills in missing bundled files without overwriting user edits", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "promptbar-sync-"));
  const bundledPromptsDirectory = join(fixtureRoot, "bundled");
  const userPromptsDirectory = join(fixtureRoot, "user");

  mkdirSync(join(bundledPromptsDirectory, "nested"), { recursive: true });
  mkdirSync(userPromptsDirectory, { recursive: true });

  writeFileSync(join(bundledPromptsDirectory, "default.md"), "bundled default\n", "utf8");
  writeFileSync(join(bundledPromptsDirectory, "academic-revision-quick-nav.md"), "quick nav\n", "utf8");
  writeFileSync(join(bundledPromptsDirectory, "nested", "child.md"), "nested child\n", "utf8");

  writeFileSync(join(userPromptsDirectory, "default.md"), "user customized default\n", "utf8");

  const script = `
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { syncBundledPromptsIntoUserDirectory } from "./src/main/prompt-directory-sync.ts";

syncBundledPromptsIntoUserDirectory({
  bundledPromptsDirectory: ${JSON.stringify(bundledPromptsDirectory)},
  userPromptsDirectory: ${JSON.stringify(userPromptsDirectory)}
});

assert.equal(
  readFileSync(join(${JSON.stringify(userPromptsDirectory)}, "default.md"), "utf8"),
  "user customized default\\n"
);
assert.equal(
  readFileSync(join(${JSON.stringify(userPromptsDirectory)}, "academic-revision-quick-nav.md"), "utf8"),
  "quick nav\\n"
);
assert.equal(
  readFileSync(join(${JSON.stringify(userPromptsDirectory)}, "nested", "child.md"), "utf8"),
  "nested child\\n"
);
assert.equal(existsSync(join(${JSON.stringify(userPromptsDirectory)}, "nested")), true);
`;

  try {
    const result = runTypeScriptCheck(script);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(readFileSync(join(userPromptsDirectory, "default.md"), "utf8"), "user customized default\n");
    assert.equal(readFileSync(join(userPromptsDirectory, "academic-revision-quick-nav.md"), "utf8"), "quick nav\n");
    assert.equal(readFileSync(join(userPromptsDirectory, "nested", "child.md"), "utf8"), "nested child\n");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
