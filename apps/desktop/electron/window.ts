import { BrowserWindow, screen, Display, app } from 'electron';
import * as path from 'path';
import log from 'electron-log';

let petWindow: BrowserWindow | null = null;

const DEFAULT_WIDTH = 520;
const DEFAULT_HEIGHT = 760;

export function createPetWindow(): BrowserWindow {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  // Default position: bottom-right corner
  const defaultX = screenWidth - DEFAULT_WIDTH - 20;
  const defaultY = screenHeight - DEFAULT_HEIGHT - 20;

  // Hide from macOS Dock to prevent window-manager flashing
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  petWindow = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    x: defaultX,
    y: defaultY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  petWindow.webContents.on('did-finish-load', () => {
    log.info('Pet window loaded successfully');
  });

  // Capture renderer console logs
  petWindow.webContents.on('console-message', (_event, level, message) => {
    const levels = ['verbose', 'info', 'warn', 'error'];
    const levelName = levels[level] || 'unknown';
    log.info(`[Renderer ${levelName}] ${message}`);
  });

  // Load the app
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    petWindow.loadURL('http://localhost:5173');
    petWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    petWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }

  petWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    log.error(`Failed to load: ${errorCode} - ${errorDescription}`);
  });

  petWindow.on('closed', () => {
    petWindow = null;
  });

  petWindow.setVisibleOnAllWorkspaces(true);

  log.info('Pet window created');
  return petWindow;
}

export function getPetWindow(): BrowserWindow | null {
  return petWindow;
}

export function setPetWindow(win: BrowserWindow): void {
  petWindow = win;
}

export function getDisplayForWindow(): Display {
  if (!petWindow) {
    return screen.getPrimaryDisplay();
  }
  const windowBounds = petWindow.getBounds();
  return screen.getDisplayNearestPoint({ x: windowBounds.x, y: windowBounds.y });
}
