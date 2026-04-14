import { BrowserWindow, screen } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getRendererViewTarget,
  getPopupWindowOptions,
  POPUP_ALWAYS_ON_TOP_LEVEL,
  POPUP_WORKSPACE_VISIBILITY_OPTIONS,
  resolvePopupWindowStrategy,
  showPopupWindow as applyPopupWindowDisplay,
  type RendererView
} from "./window-config.js";
import { readSafePopupWindowState } from "./popup-window-state.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

function getPopupStrategy() {
  return resolvePopupWindowStrategy(process.env.PROMPTBAR_POPUP_WINDOW_STRATEGY);
}

function logPopupWindowState(
  phase: "create" | "show-before" | "show-after" | "hide-before" | "hide-after",
  popupWindow: BrowserWindow
) {
  const state = readSafePopupWindowState(popupWindow, { includeBounds: true });
  console.info(
    `[popup-window:${phase}] strategy=${getPopupStrategy()} visible=${state.visible} focused=${state.focused} destroyed=${state.destroyed} bounds=${JSON.stringify(state.bounds)}`
  );
}

export function createPopupWindow() {
  const popupWindow = createRendererWindow(
    getPopupWindowOptions(getPopupStrategy())
  );

  popupWindow.setVisibleOnAllWorkspaces(true, POPUP_WORKSPACE_VISIBILITY_OPTIONS);
  popupWindow.setAlwaysOnTop(true, POPUP_ALWAYS_ON_TOP_LEVEL);
  popupWindow.setFullScreenable(false);

  loadRendererView(popupWindow, "popup");
  logPopupWindowState("create", popupWindow);
  return popupWindow;
}

export function createManagerWindow() {
  const managerWindow = createRendererWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: "PromptBar Manager",
    titleBarStyle: "default"
  });

  loadRendererView(managerWindow, "manager");
  return managerWindow;
}

export function createSettingsWindow() {
  const settingsWindow = createRendererWindow({
    width: 860,
    height: 640,
    minWidth: 720,
    minHeight: 560,
    show: false,
    title: "PromptBar Settings",
    titleBarStyle: "default"
  });

  loadRendererView(settingsWindow, "settings");
  return settingsWindow;
}

function createRendererWindow(options: ConstructorParameters<typeof BrowserWindow>[0]) {
  const popupWindow = new BrowserWindow({
    ...options,
    webPreferences: {
      preload: join(currentDirectory, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  popupWindow.webContents.on("console-message", (_, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${sourceId}:${line} ${message}`);
  });

  popupWindow.webContents.on("did-fail-load", (_, errorCode, errorDescription, validatedURL) => {
    console.error(
      `[renderer:load-fail] code=${errorCode} description=${errorDescription} url=${validatedURL}`
    );
  });

  popupWindow.webContents.on("render-process-gone", (_, details) => {
    console.error(`[renderer:gone] reason=${details.reason} exitCode=${details.exitCode}`);
  });

  return popupWindow;
}

function loadRendererView(window: BrowserWindow, view: RendererView) {
  const target = getRendererViewTarget(process.env.ELECTRON_RENDERER_URL, currentDirectory, view);

  if (target.kind === "url") {
    void window.loadURL(target.target);
    return;
  }

  void window.loadFile(target.target, {
    query: target.query
  });
}

export function hidePopupWindow(popupWindow: BrowserWindow) {
  logPopupWindowState("hide-before", popupWindow);
  popupWindow.hide();
  logPopupWindowState("hide-after", popupWindow);
}

export function showPopupWindow(popupWindow: BrowserWindow) {
  logPopupWindowState("show-before", popupWindow);
  positionPopupNearCursor(popupWindow);
  applyPopupWindowDisplay(popupWindow);
  logPopupWindowState("show-after", popupWindow);
}

function positionPopupNearCursor(popupWindow: BrowserWindow) {
  const cursorPoint = screen.getCursorScreenPoint();
  const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const { x: sx, y: sy, width: sw, height: sh } = activeDisplay.workArea;
  const [pw, ph] = popupWindow.getSize();

  let x = cursorPoint.x - Math.round(pw / 2);
  let y = cursorPoint.y - Math.round(ph / 2);

  x = Math.max(sx, Math.min(x, sx + sw - pw));
  y = Math.max(sy, Math.min(y, sy + sh - ph));

  popupWindow.setPosition(x, y);
}
