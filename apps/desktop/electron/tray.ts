import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import * as path from 'path';
import log from 'electron-log';

let tray: Tray | null = null;

export function createTray(petWindow: BrowserWindow): Tray {
  // Create a simple tray icon (16x16 for tray)
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../assets/icon.png');

  // Create a default icon if file doesn't exist
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      icon = createDefaultIcon();
    }
  } catch {
    icon = createDefaultIcon();
  }

  tray = new Tray(icon);
  tray.setToolTip('ViviPet');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide',
      click: () => {
        if (petWindow.isVisible()) {
          petWindow.hide();
        } else {
          petWindow.show();
        }
      },
    },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: true,
      click: (menuItem) => {
        petWindow.setAlwaysOnTop(menuItem.checked);
      },
    },
    {
      label: 'Mouse Passthrough',
      type: 'checkbox',
      checked: false,
      click: (menuItem) => {
        const on = menuItem.checked;
        petWindow.setIgnoreMouseEvents(on, { forward: true });
        log.info(`Mouse passthrough: ${on}`);
      },
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        petWindow.webContents.send('pet:action', 'openSettings');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Double-click to show/hide
  tray.on('double-click', () => {
    if (petWindow.isVisible()) {
      petWindow.hide();
    } else {
      petWindow.show();
    }
  });

  log.info('System tray created');
  return tray;
}

function createDefaultIcon(): Electron.NativeImage {
  // Create a simple 16x16 icon programmatically
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);

  // Fill with a solid color (purple-ish)
  for (let i = 0; i < size * size; i++) {
    canvas[i * 4] = 128;     // R
    canvas[i * 4 + 1] = 0;   // G
    canvas[i * 4 + 2] = 255; // B
    canvas[i * 4 + 3] = 255; // A
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

export function getTray(): Tray | null {
  return tray;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
    log.info('System tray destroyed');
  }
}
