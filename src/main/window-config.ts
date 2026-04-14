import { join } from "node:path";

export type RendererView = "popup" | "manager" | "settings";
export type PopupWindowStrategy = "panel" | "plain";

export const POPUP_WORKSPACE_VISIBILITY_OPTIONS = {
  visibleOnFullScreen: true
} as const;

export const POPUP_ALWAYS_ON_TOP_LEVEL = "screen-saver" as const;

export type PopupDisplayTarget = {
  setVisibleOnAllWorkspaces: (
    visibleOnAllWorkspaces: boolean,
    options: typeof POPUP_WORKSPACE_VISIBILITY_OPTIONS
  ) => void;
  setAlwaysOnTop: (
    flag: boolean,
    level: typeof POPUP_ALWAYS_ON_TOP_LEVEL
  ) => void;
  moveTop?: () => void;
  focus?: () => void;
  show: () => void;
  showInactive?: () => void;
};

export function resolvePopupWindowStrategy(
  strategy: string | undefined
): PopupWindowStrategy {
  return strategy === "panel" ? "panel" : "plain";
}

export function getPopupWindowOptions(strategy: PopupWindowStrategy) {
  const baseOptions = {
    width: 440,
    height: 560,
    minWidth: 380,
    minHeight: 420,
    show: false,
    frame: false,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true
  };

  if (strategy === "panel") {
    return {
      ...baseOptions,
      type: "panel" as const,
      titleBarStyle: "hidden" as const,
      vibrancy: "under-window" as const,
      visualEffectState: "active" as const,
      transparent: true
    };
  }

  return {
    ...baseOptions,
    titleBarStyle: "hidden" as const,
    backgroundColor: "#0f172a"
  };
}

export function getRendererViewTarget(
  rendererUrl: string | undefined,
  currentDirectory: string,
  view: RendererView
) {
  if (rendererUrl) {
    return {
      kind: "url" as const,
      target: `${rendererUrl}#${view}`
    };
  }

  return {
    kind: "file" as const,
    target: join(currentDirectory, "../renderer/index.html"),
    query: { view }
  };
}

export function showPopupWindow(target: PopupDisplayTarget) {
  target.setVisibleOnAllWorkspaces(true, POPUP_WORKSPACE_VISIBILITY_OPTIONS);
  target.setAlwaysOnTop(true, POPUP_ALWAYS_ON_TOP_LEVEL);
  target.show();
  target.moveTop?.();
  target.focus?.();
}

export function shouldHidePopupOnBlur(
  _lastShownAt: number | null,
  _now: number
) {
  return false;
}
