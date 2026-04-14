import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

test("built renderer html points to a bundled asset", () => {
  const html = readFileSync(resolve("out/renderer/index.html"), "utf8");

  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /src="\.\/assets\/index-.*\.js"/);
  assert.doesNotMatch(html, /src="\/src\/main\.tsx"/);
});

test("main process references a CommonJS preload bundle", () => {
  const mainBundle = readFileSync(resolve("out/main/index.js"), "utf8");

  assert.match(mainBundle, /\.\.\/preload\/index\.js/);
  assert.equal(existsSync(resolve("out/preload/index.js")), true);
});

test("tray template assets keep a transparent background", () => {
  const script = `
from PIL import Image
for path in ["resources/TrayTemplate.png", "resources/TrayTemplate@2x.png"]:
    img = Image.open(path).convert("RGBA")
    assert img.getpixel((0, 0))[3] == 0, (path, img.getpixel((0, 0)))
    assert img.getbbox() is not None, path
`;
  const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("popup scroll decision is handled by shouldScrollToItem (behavioral)", () => {
  const script = `
import assert from "node:assert/strict";
import { shouldScrollToItem } from "./src/renderer/src/popup-navigation.ts";
assert.equal(shouldScrollToItem("prompt-2", "prompt-1"), true);
assert.equal(shouldScrollToItem("prompt-1", "prompt-1"), false);
assert.equal(shouldScrollToItem(null, "prompt-1"), false);
`;
  const result = spawnSync(
    "node",
    ["--experimental-strip-types", "--experimental-specifier-resolution=node", "--input-type=module", "-e", script],
    { cwd: resolve("."), encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("full visible prompt list is rendered without truncation (behavioral)", () => {
  const script = `
import assert from "node:assert/strict";
import { getVisiblePrompts } from "./src/renderer/src/popup-navigation.ts";
const items = Array.from({ length: 20 }, (_, i) => ({
  title: "Item " + i, description: "", body: "", packId: "p",
  aliases: [], tags: [], favorite: false
}));
const result = getVisiblePrompts(items, items, "");
assert.equal(result.length, 20, "all 20 items must be visible");
`;
  const result = spawnSync(
    "node",
    ["--experimental-strip-types", "--experimental-specifier-resolution=node", "--input-type=module", "-e", script],
    { cwd: resolve("."), encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
