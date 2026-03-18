import { clipboard } from 'electron';
import { exec } from 'child_process';

/**
 * Paste text into the currently focused application.
 * Strategy: save clipboard -> write text to clipboard -> simulate Cmd+V -> restore clipboard
 */
export async function pasteToActiveApp(text: string): Promise<void> {
  const previousClipboard = clipboard.readText();
  clipboard.writeText(text);
  await sleep(50);
  await runAppleScript(`
    tell application "System Events"
      keystroke "v" using command down
    end tell
  `);
  await sleep(200);
  clipboard.writeText(previousClipboard);
}

function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

/** Get cursor screen position using AppleScript */
export async function getCursorPosition(): Promise<{ x: number; y: number }> {
  try {
    const result = await runAppleScript(`
      use framework "AppKit"
      set mouseLocation to current application's NSEvent's mouseLocation()
      set screenHeight to (current application's NSScreen's mainScreen()'s frame()'s |size|()'s height) as integer
      set x to (mouseLocation's x) as integer
      set y to (screenHeight - (mouseLocation's y)) as integer
      return (x as text) & "," & (y as text)
    `);
    const [x, y] = result.split(',').map(Number);
    return { x: x || 0, y: y || 0 };
  } catch {
    return { x: 100, y: 100 };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
