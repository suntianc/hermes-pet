import { ipcMain, screen } from 'electron';
import log from 'electron-log';
import { getPetWindow } from './window';
import { updateTrayModelNames } from './tray';
import { importModelViaDialog, indexBundledModels, listUserModels } from './model-manager';
import { getCurrentModelId, listModelActions, setCurrentModelId } from './action-index';

let dragSession: {
  pointerX: number;
  pointerY: number;
  windowX: number;
  windowY: number;
} | null = null;

export function registerIpcHandlers(): void {
  // Pet window handlers
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

  // Simple resize that keeps bottom-right anchored
  ipcMain.on('pet:window:setSizeAnchored', (_event, width: number, height: number) => {
    const win = getPetWindow();
    if (!win) return;
    const bounds = win.getBounds();
    const x = bounds.x + bounds.width - width;
    const y = bounds.y + bounds.height - height;
    win.setBounds({ x, y, width: Math.round(width), height: Math.round(height) });
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

  ipcMain.handle('pet:model:indexBundledModels', async (_event, models: Array<{ id: string; name: string; path: string }>) => {
    indexBundledModels(models);
  });

  ipcMain.handle('pet:model:setCurrent', async (_event, modelId: string) => {
    setCurrentModelId(modelId);
  });

  ipcMain.handle('pet:model:listActions', async (_event, modelId?: string) => {
    return listModelActions(modelId || getCurrentModelId());
  });

  log.info('IPC handlers registered');
}
