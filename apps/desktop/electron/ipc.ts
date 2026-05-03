import { ipcMain, screen, app } from 'electron';
import log from 'electron-log';
import { getPetWindow } from './window';
import { getTray, updateTrayModelNames } from './tray';
import { importModelViaDialog, listUserModels, removeUserModel } from './model-manager';

let dragSession: {
  pointerX: number;
  pointerY: number;
  windowX: number;
  windowY: number;
} | null = null;

export function registerIpcHandlers(): void {
  // Pet window handlers
  ipcMain.on('pet:window:minimize', () => {
    const win = getPetWindow();
    if (win) win.minimize();
  });

  ipcMain.on('pet:window:hide', () => {
    const win = getPetWindow();
    if (win) {
      win.hide();
      app.dock?.hide();
    }
  });

  ipcMain.on('pet:window:show', () => {
    const win = getPetWindow();
    if (win) {
      win.show();
      win.focus();
      app.dock?.show();
    }
  });

  ipcMain.on('pet:window:close', () => {
    const win = getPetWindow();
    // Close from renderer = always hide to tray.
    // True quit is only via the tray "Quit" menu item.
    if (win) win.hide();
  });

  ipcMain.on('pet:window:setAlwaysOnTop', (_event, flag: boolean) => {
    const win = getPetWindow();
    if (win) {
      win.setAlwaysOnTop(flag);
      log.info(`Always on top set to: ${flag}`);
    }
  });

  ipcMain.on('pet:window:setIgnoreMouseEvents', (_event, ignore: boolean, options?: { forward: boolean }) => {
    const win = getPetWindow();
    if (win) {
      win.setIgnoreMouseEvents(ignore, options);
      log.info(`Passthrough mode: ${ignore}`);
    }
  });

  ipcMain.on('pet:window:beginDrag', () => {
    const win = getPetWindow();
    if (!win) return;

    const [windowX, windowY] = win.getPosition();
    const pointer = screen.getCursorScreenPoint();
    dragSession = {
      pointerX: pointer.x,
      pointerY: pointer.y,
      windowX,
      windowY,
    };
  });

  ipcMain.on('pet:window:dragToCursor', () => {
    const win = getPetWindow();
    if (!win || !dragSession) return;

    const pointer = screen.getCursorScreenPoint();
    win.setPosition(
      Math.round(dragSession.windowX + pointer.x - dragSession.pointerX),
      Math.round(dragSession.windowY + pointer.y - dragSession.pointerY),
    );
  });

  ipcMain.on('pet:window:endDrag', () => {
    dragSession = null;
  });

  ipcMain.handle('pet:window:getPosition', () => {
    const win = getPetWindow();
    if (win) {
      const [x, y] = win.getPosition();
      return { x, y };
    }
    return { x: 0, y: 0 };
  });

  ipcMain.handle('pet:window:getCursorScreenPoint', () => {
    return screen.getCursorScreenPoint();
  });

  ipcMain.on('pet:window:setPosition', (_event, x: number, y: number) => {
    const win = getPetWindow();
    if (win) {
      win.setPosition(x, y);
    }
  });

  ipcMain.handle('pet:window:getSize', () => {
    const win = getPetWindow();
    if (win) {
      const [width, height] = win.getSize();
      return { width, height };
    }
    return { width: 0, height: 0 };
  });

  ipcMain.on('pet:window:setSize', (_event, width: number, height: number) => {
    const win = getPetWindow();
    if (!win) return;

    const nextWidth = Math.max(1, Math.round(width));
    const nextHeight = Math.max(1, Math.round(height));
    const bounds = win.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const { x: areaX, y: areaY, width: areaWidth, height: areaHeight } = display.workArea;

    const x = Math.min(
      Math.max(bounds.x + Math.round((bounds.width - nextWidth) / 2), areaX),
      areaX + areaWidth - nextWidth,
    );
    const y = Math.min(Math.max(bounds.y + bounds.height - nextHeight, areaY), areaY + areaHeight - nextHeight);

    win.setBounds({ x, y, width: nextWidth, height: nextHeight });
  });

  ipcMain.handle('pet:window:isAlwaysOnTop', () => {
    const win = getPetWindow();
    return win ? win.isAlwaysOnTop() : false;
  });

  // Tray handlers
  ipcMain.on('pet:tray:setIcon', (_event, iconPath: string) => {
    const tray = getTray();
    if (tray) {
      tray.setImage(iconPath);
    }
  });

  ipcMain.on('pet:tray:setToolTip', (_event, tooltip: string) => {
    const tray = getTray();
    if (tray) {
      tray.setToolTip(tooltip);
    }
  });

  // ---- Tray model list sync ----
  ipcMain.on('pet:tray:updateModelNames', (_event, names: string[]) => {
    updateTrayModelNames(names);
  });

  // ---- Model management ----
  ipcMain.handle('pet:model:import', async () => {
    return importModelViaDialog();
  });

  ipcMain.handle('pet:model:listUserModels', async () => {
    return listUserModels();
  });

  ipcMain.handle('pet:model:remove', async (_event, modelId: string) => {
    return removeUserModel(modelId);
  });

  log.info('IPC handlers registered');
}
