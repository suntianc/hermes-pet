import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import * as path from 'path';
import log from 'electron-log';
import { setIsQuitting } from './app-state';

let tray: Tray | null = null;

export function createTray(petWindow: BrowserWindow): Tray {
  const trayIcon = loadTrayIcon();

  tray = new Tray(trayIcon);
  tray.setToolTip('ViviPet');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide',
      click: () => {
        if (petWindow.isVisible()) {
          petWindow.hide();
          app.dock?.hide(); // Hide Dock indicator when hiding
        } else {
          petWindow.show();
          app.dock?.show(); // Show Dock indicator when revealing
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
        setIsQuitting(true); // Must be set before app.quit() to allow window close
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Double-click to show/hide
  tray.on('double-click', () => {
    if (petWindow.isVisible()) {
      petWindow.hide();
      app.dock?.hide();
    } else {
      petWindow.show();
      app.dock?.show();
    }
  });

  log.info('System tray created');
  return tray;
}

/**
 * Load the tray icon.
 * - On macOS: use a native SF Symbol (pawprint.fill) which always works
 *   and automatically adapts to light/dark menu bar appearance.
 * - On Windows: load the app icon from the assets directory.
 */
function loadTrayIcon(): Electron.NativeImage {
  if (process.platform === 'darwin') {
    // macOS: use native SF Symbol — guaranteed to render in the menu bar
    const icon = nativeImage.createFromNamedImage('v.circle.fill');
    if (!icon || icon.isEmpty()) {
      log.warn('SF Symbol v.circle.fill not available, falling back to star.fill');
      const fallback = nativeImage.createFromNamedImage('star.fill');
      const sized = fallback.resize({ width: 18, height: 18 });
      sized.setTemplateImage(true);
      return sized;
    }
    const sized = icon.resize({ width: 18, height: 18 });
    sized.setTemplateImage(true);
    log.info('Tray icon: SF Symbol v.circle.fill');
    return sized;
  }

  // Windows: load from file
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'icon.png')
    : path.join(__dirname, '../../assets/icon.png');

  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      log.info('Tray icon loaded from file');
      return icon.resize({ width: 18, height: 18 });
    }
  } catch (err) {
    log.warn('Failed to load tray icon from file:', err);
  }

  // Fallback: solid white circle
  const S = 18;
  const buf = Buffer.alloc(S * S * 4, 0);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - 9, dy = y - 9;
      if (dx * dx + dy * dy <= 7 * 7) {
        const i = (y * S + x) * 4;
        buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255; buf[i + 3] = 255;
      }
    }
  }
  return nativeImage.createFromBuffer(buf, { width: S, height: S });
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
