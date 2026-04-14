export const CLIPBOARD_RESTORE_DELAY_MS = 600;

export function shouldRestorePreviousClipboard(currentClipboardText: string, pastedText: string) {
  return currentClipboardText === pastedText;
}
