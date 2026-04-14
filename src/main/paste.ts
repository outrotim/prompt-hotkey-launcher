import { execFile } from "node:child_process";
import {
  CLIPBOARD_RESTORE_DELAY_MS,
  shouldRestorePreviousClipboard
} from "./paste-clipboard.js";
import { runNativePasteHelper } from "./native-paste.js";

export async function pasteText(text: string) {
  const clipboard = await loadElectronClipboard();
  const platform = process.platform;

  return pasteTextWithDependencies(text, {
    platform,
    readClipboard: () => clipboard.readText(),
    writeClipboard: (nextText) => clipboard.writeText(nextText),
    runNativePaste: () => runNativePasteHelper(platform),
    runAppleScript: (args) => runAppleScript(args),
    wait: (milliseconds) => wait(milliseconds)
  });
}

export async function pasteTextWithDependencies(
  text: string,
  dependencies: {
    platform: NodeJS.Platform;
    readClipboard: () => string;
    writeClipboard: (nextText: string) => void;
    runNativePaste: () => Promise<void>;
    runAppleScript: (args: string[]) => Promise<void>;
    wait: (milliseconds: number) => Promise<void>;
  }
) {
  let previousClipboard = "";

  console.info(`[paste:start] textLength=${text.length}`);

  try {
    previousClipboard = dependencies.readClipboard();
  } catch {
    // Clipboard unavailable (locked screen, permissions revoked, etc.)
    console.warn("[paste:clipboard-read-before] unavailable");
  }

  dependencies.writeClipboard(text);
  console.info("[paste:clipboard-written]");

  try {
    try {
      await dependencies.runNativePaste();
      console.info("[paste:native-helper-success]");
    } catch (error) {
      console.warn(`[paste:native-helper-failed] error=${describeError(error)}`);

      if (dependencies.platform !== "darwin") {
        throw error;
      }

      await dependencies.runAppleScript([
        "-e",
        'tell application "System Events" to keystroke "v" using command down'
      ]);
      console.info("[paste:applescript-success]");
    }
  } catch (error) {
    console.warn(`[paste:applescript-failed] error=${describeError(error)}`);
    throw error;
  } finally {
    await dependencies.wait(CLIPBOARD_RESTORE_DELAY_MS);

    try {
      const currentClipboard = dependencies.readClipboard();

      if (shouldRestorePreviousClipboard(currentClipboard, text)) {
        dependencies.writeClipboard(previousClipboard);
        console.info("[paste:clipboard-restored]");
      } else {
        console.info("[paste:clipboard-restore-skipped]");
      }
    } catch {
      // Clipboard unavailable during restore — nothing we can do
      console.warn("[paste:clipboard-read-after] unavailable");
    }
  }
}

function runAppleScript(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile("osascript", args, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function loadElectronClipboard() {
  const electron = await import("electron");
  return electron.clipboard;
}
