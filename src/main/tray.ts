import { Tray, Menu, nativeImage, app } from 'electron';
import { openManager, openSettings, showPopup } from './window';

let tray: Tray | null = null;

export function createTray(): void {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABhSURBVDiNY2AYBYMBMDIwMPxnYGD4T4phJgYGBgZGBgYGRkoNYIIKUMUAJmINUOoFRgYGBkZKvMDEQKYXKA4DJmq4gCpeoIoXqBIGTFRxAdW8QJUwYKKKC6jmBYYhDQAA5DkMEXbDkiYAAAAASUVORK5CYII='
  );

  icon.setTemplateImage(true);
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Launcher',
      click: () => showPopup(),
    },
    { type: 'separator' },
    {
      label: 'Manage Prompts',
      click: () => openManager(),
    },
    {
      label: 'Settings',
      click: () => openSettings(),
    },
    { type: 'separator' },
    {
      label: `Prompt Launcher v${app.getVersion()}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);

  tray.setToolTip('Prompt Launcher');
  tray.setContextMenu(contextMenu);
}
