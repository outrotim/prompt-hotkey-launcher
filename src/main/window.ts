import { BrowserWindow, screen } from 'electron';
import * as path from 'path';
import { getCursorPosition } from './paste';

let popupWindow: BrowserWindow | null = null;
let managerWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development';

function getRendererUrl(route: string): string {
  if (isDev) {
    return `http://localhost:5173/#${route}`;
  }
  return `file://${path.join(__dirname, '../../renderer/index.html')}#${route}`;
}

/** Create or show the popup window near cursor */
export async function showPopup(): Promise<void> {
  const cursorPos = await getCursorPosition();

  if (!popupWindow || popupWindow.isDestroyed()) {
    popupWindow = new BrowserWindow({
      width: 420,
      height: 360,
      x: cursorPos.x,
      y: cursorPos.y,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    popupWindow.loadURL(getRendererUrl('/popup'));

    popupWindow.on('blur', () => {
      hidePopup();
    });

    popupWindow.once('ready-to-show', () => {
      positionPopup(cursorPos);
      popupWindow?.show();
      popupWindow?.focus();
    });
  } else {
    positionPopup(cursorPos);
    popupWindow.show();
    popupWindow.focus();
    popupWindow.webContents.send('popup-shown');
  }
}

function positionPopup(cursorPos: { x: number; y: number }): void {
  if (!popupWindow) return;

  const display = screen.getDisplayNearestPoint(cursorPos);
  const bounds = display.workArea;
  const windowBounds = popupWindow.getBounds();

  let x = cursorPos.x;
  let y = cursorPos.y + 10;

  if (x + windowBounds.width > bounds.x + bounds.width) {
    x = bounds.x + bounds.width - windowBounds.width;
  }
  if (y + windowBounds.height > bounds.y + bounds.height) {
    y = cursorPos.y - windowBounds.height - 10;
  }
  if (x < bounds.x) x = bounds.x;
  if (y < bounds.y) y = bounds.y;

  popupWindow.setPosition(Math.round(x), Math.round(y));
}

/** Hide the popup */
export function hidePopup(): void {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.hide();
  }
}

/** Open the manager window */
export function openManager(): void {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.focus();
    return;
  }

  managerWindow = new BrowserWindow({
    width: 900,
    height: 650,
    title: 'Prompt Manager',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  managerWindow.loadURL(getRendererUrl('/manager'));

  managerWindow.on('closed', () => {
    managerWindow = null;
  });
}

/** Open the settings window */
export function openSettings(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 450,
    title: 'Settings',
    titleBarStyle: 'hiddenInset',
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadURL(getRendererUrl('/settings'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

export function getPopupWindow(): BrowserWindow | null {
  return popupWindow;
}
