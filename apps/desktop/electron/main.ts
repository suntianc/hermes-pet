import { app } from 'electron';
import log from 'electron-log';
import { createPetWindow, getPetWindow, setPetWindow } from './window';
import { createTray, destroyTray } from './tray';
import { registerIpcHandlers } from './ipc';
import { startEventBridge, stopEventBridge } from './event-bridge';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.info('ViviPet starting...');

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

  try {
    const petWindow = createPetWindow();
    setPetWindow(petWindow);
    createTray(petWindow);
    registerIpcHandlers();
    startEventBridge(getPetWindow);

    log.info('ViviPet initialized successfully');
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
  stopEventBridge();
  destroyTray();
});
