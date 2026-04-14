import { messages } from "../shared/messages.js";
import type { PromptDeliveryMode, PromptItem, PromptUsageRecord } from "../shared/types";

const DEFAULT_PASTE_DELAY_MS = 180;

export type PromptSelectionWindow = {
  isDestroyed: () => boolean;
};

export type ExecutePromptSelectionOptions<TWindow extends PromptSelectionWindow> = {
  prompt: PromptItem;
  variables: Record<string, string>;
  deliveryMode?: PromptDeliveryMode;
  popupWindow: TWindow;
  renderPromptBody: (prompt: PromptItem, variables: Record<string, string>) => string;
  pasteText: (text: string) => Promise<void>;
  writeClipboard?: (text: string) => void;
  appendToFile?: (filePath: string, text: string) => void;
  runShellCommand?: (command: string, stdin: string) => void;
  recordUsage: (record: PromptUsageRecord) => void;
  hidePopupWindow: (popupWindow: TWindow) => void;
  restoreAppFocus?: () => void | Promise<void>;
  showPopupWindow: (popupWindow: TWindow) => void;
  notifyPopupOpened: () => void;
  notifyClipboardFallback?: (message: string) => void;
  wait: (milliseconds: number) => Promise<void>;
  delayMs?: number;
  readClipboardText?: () => string;
};

export type PromptSelectionResult = {
  ok: true;
  renderedText: string;
  delivery: "default" | "clipboard-fallback" | "clipboard-manual";
  message?: string;
};

export async function executePromptSelection<TWindow extends PromptSelectionWindow>(
  options: ExecutePromptSelectionOptions<TWindow>
): Promise<PromptSelectionResult> {
  const enrichedVariables = options.readClipboardText
    ? { clipboard: options.readClipboardText(), ...options.variables }
    : options.variables;
  const renderedText = options.renderPromptBody(options.prompt, enrichedVariables);
  const outputMode = options.prompt.output ?? "paste";
  const shouldUseClipboardOnly = options.deliveryMode === "clipboard" && outputMode === "paste";

  console.info(
    `[prompt-selection:start] promptId=${options.prompt.id} outputMode=${outputMode} deliveryMode=${options.deliveryMode ?? "auto"} textLength=${renderedText.length}`
  );

  options.hidePopupWindow(options.popupWindow);
  console.info(`[prompt-selection:hidden] promptId=${options.prompt.id}`);

  try {
    await options.restoreAppFocus?.();
    console.info(`[prompt-selection:focus-restored] promptId=${options.prompt.id}`);

    if (shouldUseClipboardOnly && options.writeClipboard) {
      console.info(`[prompt-selection:clipboard-only] promptId=${options.prompt.id}`);
      options.writeClipboard(renderedText);
      recordPromptUsage(options);
      runAfterSelection(options, renderedText);

      return {
        ok: true,
        renderedText,
        delivery: "clipboard-manual",
        message: "已复制到剪贴板，请手动粘贴一次。"
      };
    }

    if (outputMode === "paste") {
      const delayMs = options.delayMs ?? DEFAULT_PASTE_DELAY_MS;
      console.info(`[prompt-selection:before-paste] promptId=${options.prompt.id} delayMs=${delayMs}`);
      await options.wait(delayMs);
      try {
        await options.pasteText(renderedText);
        console.info(`[prompt-selection:paste-success] promptId=${options.prompt.id}`);
      } catch (error) {
        console.warn(
          `[prompt-selection:paste-failed] promptId=${options.prompt.id} error=${describeError(error)}`
        );
        if (shouldFallbackToClipboard(error) && options.writeClipboard) {
          const fallbackMessage = messages.autoPasteFallbackMessage.zhCN;
          console.info(`[prompt-selection:clipboard-fallback] promptId=${options.prompt.id}`);
          options.writeClipboard(renderedText);
          recordPromptUsage(options);
          runAfterSelection(options, renderedText);
          options.notifyClipboardFallback?.(fallbackMessage);

          return {
            ok: true,
            renderedText,
            delivery: "clipboard-fallback",
            message: fallbackMessage
          };
        }

        throw error;
      }
    } else if (outputMode === "clipboard" && options.writeClipboard) {
      console.info(`[prompt-selection:output-clipboard] promptId=${options.prompt.id}`);
      options.writeClipboard(renderedText);
    } else if (outputMode === "file" && options.prompt.outputFile && options.appendToFile) {
      console.info(
        `[prompt-selection:output-file] promptId=${options.prompt.id} filePath=${options.prompt.outputFile}`
      );
      options.appendToFile(options.prompt.outputFile, renderedText + "\n");
    }

    recordPromptUsage(options);
    runAfterSelection(options, renderedText);
    console.info(`[prompt-selection:complete] promptId=${options.prompt.id}`);

    return {
      ok: true,
      renderedText,
      delivery: "default"
    };
  } catch (error) {
    if (!options.popupWindow.isDestroyed()) {
      console.warn(
        `[prompt-selection:reopen-popup-after-error] promptId=${options.prompt.id} error=${describeError(error)}`
      );
      options.showPopupWindow(options.popupWindow);
      options.notifyPopupOpened();
    }

    throw error;
  }
}

function recordPromptUsage<TWindow extends PromptSelectionWindow>(
  options: ExecutePromptSelectionOptions<TWindow>
) {
  options.recordUsage({
    promptId: options.prompt.id,
    usedAt: new Date().toISOString(),
    values: options.variables
  });
}

function runAfterSelection<TWindow extends PromptSelectionWindow>(
  options: ExecutePromptSelectionOptions<TWindow>,
  renderedText: string
) {
  if (
    options.prompt.after?.type === "shell" &&
    options.prompt.after.command &&
    options.runShellCommand
  ) {
    options.runShellCommand(options.prompt.after.command, renderedText);
  }
}

function shouldFallbackToClipboard(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /1002/.test(error.message) ||
    /不允许发送按键/u.test(error.message) ||
    /not allowed to send keystrokes/i.test(error.message) ||
    /not allowed assistive access/i.test(error.message) ||
    /Ctrl\+V/u.test(error.message) ||
    /foreground window/i.test(error.message) ||
    /Win32 error/i.test(error.message);
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
