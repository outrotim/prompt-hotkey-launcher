export type PopupWindowStateTarget = {
  isVisible: () => boolean;
  isFocused: () => boolean;
  isDestroyed: () => boolean;
  getBounds?: () => { x: number; y: number; width: number; height: number };
};

export type SafePopupWindowState = {
  visible: boolean | "unavailable";
  focused: boolean | "unavailable";
  destroyed: boolean;
  bounds?: { x: number; y: number; width: number; height: number } | "unavailable";
};

export function readSafePopupWindowState(
  target: PopupWindowStateTarget,
  options: { includeBounds?: boolean } = {}
): SafePopupWindowState {
  const destroyed = readWindowFlag(() => target.isDestroyed(), true);

  if (destroyed) {
    return {
      visible: "unavailable",
      focused: "unavailable",
      destroyed: true,
      ...(options.includeBounds ? { bounds: "unavailable" as const } : {})
    };
  }

  return {
    visible: readWindowFlag(() => target.isVisible(), "unavailable"),
    focused: readWindowFlag(() => target.isFocused(), "unavailable"),
    destroyed: false,
    ...(options.includeBounds
      ? { bounds: readWindowBounds(() => target.getBounds?.()) }
      : {})
  };
}

function readWindowFlag<T extends boolean | "unavailable">(
  read: () => boolean,
  fallback: T
) {
  try {
    return read();
  } catch {
    return fallback;
  }
}

function readWindowBounds(
  read: () => { x: number; y: number; width: number; height: number } | undefined
) {
  try {
    return read() ?? "unavailable";
  } catch {
    return "unavailable";
  }
}
