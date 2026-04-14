import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(
    "/Users/haoruijinlin/VItalDB/prompt-hotkey-launcher/package.json",
    "utf8"
  )
);
const electronBuilderConfig = readFileSync(
  "/Users/haoruijinlin/VItalDB/prompt-hotkey-launcher/electron-builder.yml",
  "utf8"
);

test("build scripts no longer compile the legacy external paste helper", () => {
  assert.doesNotMatch(
    packageJson.scripts.dev,
    /build-paste-helper\.mjs/,
    "dev script should not depend on the legacy external helper"
  );
  assert.doesNotMatch(
    packageJson.scripts.build,
    /build-paste-helper\.mjs/,
    "build script should not depend on the legacy external helper"
  );
});

test("packaged app no longer ships the legacy external paste helper executable", () => {
  assert.doesNotMatch(
    electronBuilderConfig,
    /promptbar-paste-helper/,
    "electron-builder config should not package the legacy external helper"
  );
});

test("package scripts expose dedicated Windows packaging commands", () => {
  assert.match(
    packageJson.scripts["dist:win:dir"],
    /electron-builder --win dir/,
    "dist:win:dir should generate an unpacked Windows app for smoke testing"
  );
  assert.match(
    packageJson.scripts["dist:win:share"],
    /electron-builder --win nsis zip/,
    "dist:win:share should generate shareable Windows artifacts"
  );
  assert.match(
    packageJson.scripts["dist:win:release"],
    /electron-builder --win nsis zip/,
    "dist:win:release should generate the signed Windows release targets"
  );
});

test("electron-builder config defines Windows targets and icon", () => {
  assert.match(
    electronBuilderConfig,
    /\nwin:\n/,
    "electron-builder config should define a Windows build block"
  );
  assert.match(
    electronBuilderConfig,
    /icon: resources\/app-icon\.ico/,
    "Windows builds should use a dedicated .ico application icon"
  );
  assert.match(
    electronBuilderConfig,
    /target:\n\s+- target: nsis/,
    "Windows builds should produce an NSIS installer"
  );
  assert.match(
    electronBuilderConfig,
    /- target: zip/,
    "Windows builds should also produce a ZIP artifact"
  );
});
