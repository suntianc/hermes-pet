import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Types for the exposed API
export interface PetWindowAPI {
  minimize: () => void;
  hide: () => void;
  show: () => void;
  close: () => void;
  setAlwaysOnTop: (flag: boolean) => void;
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
  beginDrag: () => void;
  dragToCursor: () => void;
  endDrag: () => void;
  getPosition: () => Promise<{ x: number; y: number }>;
  getCursorScreenPoint: () => Promise<{ x: number; y: number }>;
  setPosition: (x: number, y: number) => void;
  getSize: () => Promise<{ width: number; height: number }>;
  setSize: (width: number, height: number) => void;
  isAlwaysOnTop: () => Promise<boolean>;
  setModelNames: (names: string[]) => void;
}

export interface PetTrayAPI {
  setIcon: (iconPath: string) => void;
  setToolTip: (tooltip: string) => void;
}

export interface PetModelAPI {
  import: () => Promise<{
    id: string;
    name: string;
    path: string;
    window?: { width: number; height: number };
  } | null>;
  listUserModels: () => Promise<Array<{
    id: string;
    name: string;
    path: string;
    window?: { width: number; height: number };
  }>>;
  remove: (modelId: string) => Promise<boolean>;
}

export interface ElectronAPI {
  petWindow: PetWindowAPI;
  petTray: PetTrayAPI;
  petModel: PetModelAPI;
  onPetAction: (callback: (action: string, params?: unknown) => void) => () => void;
}

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Pet window controls
  petWindow: {
    minimize: () => ipcRenderer.send('pet:window:minimize'),
    hide: () => ipcRenderer.send('pet:window:hide'),
    show: () => ipcRenderer.send('pet:window:show'),
    close: () => ipcRenderer.send('pet:window:close'),
    setAlwaysOnTop: (flag: boolean) => ipcRenderer.send('pet:window:setAlwaysOnTop', flag),
    setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) =>
      ipcRenderer.send('pet:window:setIgnoreMouseEvents', ignore, options),
    beginDrag: () => ipcRenderer.send('pet:window:beginDrag'),
    dragToCursor: () => ipcRenderer.send('pet:window:dragToCursor'),
    endDrag: () => ipcRenderer.send('pet:window:endDrag'),
    getPosition: () => ipcRenderer.invoke('pet:window:getPosition'),
    getCursorScreenPoint: () => ipcRenderer.invoke('pet:window:getCursorScreenPoint'),
    setPosition: (x: number, y: number) => ipcRenderer.send('pet:window:setPosition', x, y),
    getSize: () => ipcRenderer.invoke('pet:window:getSize'),
    setSize: (width: number, height: number) => ipcRenderer.send('pet:window:setSize', width, height),
    isAlwaysOnTop: () => ipcRenderer.invoke('pet:window:isAlwaysOnTop'),
    setModelNames: (names: string[]) => ipcRenderer.send('pet:tray:updateModelNames', names),
  },

  // Tray controls
  petTray: {
    setIcon: (iconPath: string) => ipcRenderer.send('pet:tray:setIcon', iconPath),
    setToolTip: (tooltip: string) => ipcRenderer.send('pet:tray:setToolTip', tooltip),
  },

  // Pet action triggers (from renderer to main)
  onPetAction: (callback: (action: string, params?: unknown) => void) => {
    const handler = (_event: IpcRendererEvent, action: string, params?: unknown) => callback(action, params);
    ipcRenderer.on('pet:action', handler);
    return () => ipcRenderer.removeListener('pet:action', handler);
  },

  // Model management
  petModel: {
    import: () => ipcRenderer.invoke('pet:model:import'),
    listUserModels: () => ipcRenderer.invoke('pet:model:listUserModels'),
    remove: (modelId: string) => ipcRenderer.invoke('pet:model:remove', modelId),
  },
} as ElectronAPI);

// Declare global type
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
