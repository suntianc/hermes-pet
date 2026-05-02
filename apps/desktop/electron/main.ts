import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, protocol, net } from 'electron';
import * as path from 'path';
import { pathToFileURL } from 'url';
import log from 'electron-log';
import { createPetWindow, getPetWindow, setPetWindow } from './window';
import { createTray, destroyTray } from './tray';
import { registerIpcHandlers } from './ipc';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.info('HermesDeskPet starting...');

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
  app.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason);
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log.info('Another instance is already running. Quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    const petWindow = getPetWindow();
    if (petWindow) {
      if (petWindow.isMinimized()) petWindow.restore();
      petWindow.show();
      petWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  log.info('App is ready');

  // Register custom protocol for serving local Live2D model files
  protocol.handle('local-model', (request) => {
    const url = new URL(request.url);
    // URL pattern: local-model://models/meruru/texture_00.png
    // → hostname: 'models', pathname: '/meruru/texture_00.png'
    // Combined: 'models/meruru/texture_00.png'
    const assetRelativePath = decodeURIComponent(url.hostname + url.pathname);
    // Use app.getAppPath() – works in both dev mode and production
    const assetPath = path.join(app.getAppPath(), 'assets', assetRelativePath);
    log.info(`[local-model] Serving: ${assetPath}`);
    return net.fetch(pathToFileURL(assetPath).toString());
  });
  log.info('Custom protocol local-model:// registered');

  try {
    const petWindow = createPetWindow();
    setPetWindow(petWindow);
    createTray(petWindow);
    registerIpcHandlers();

    log.info('HermesDeskPet initialized successfully');
  } catch (error) {
    log.error('Failed to initialize:', error);
    app.exit(1);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  log.info('quit event fired');
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  const petWindow = getPetWindow();
  if (!petWindow) {
    const newWindow = createPetWindow();
    setPetWindow(newWindow);
  }
});

app.on('before-quit', () => {
  log.info('App is quitting...');
  destroyTray();
});
