export type PointerHoverModeEvent = "popup-opened" | "pointer-moved";

export function getNextPointerHoverEnabled(
  _current: boolean,
  event: PointerHoverModeEvent
) {
  return event === "pointer-moved";
}
