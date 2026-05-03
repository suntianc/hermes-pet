import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Types for the exposed API
export interface PetWindowAPI {
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
  beginDrag: () => void;
  dragToCursor: () => void;
  endDrag: () => void;
  getPosition: () => Promise<{ x: number; y: number }>;
  getCursorScreenPoint: () => Promise<{ x: number; y: number }>;
  setSize: (width: number, height: number) => void;
  setModelNames: (names: string[]) => void;
  setSizeAnchored: (width: number, height: number) => void;
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
}

export interface ElectronAPI {
  petWindow: PetWindowAPI;
  petModel: PetModelAPI;
  onPetAction: (callback: (action: string, params?: unknown) => void) => () => void;
}

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Pet window controls
  petWindow: {
    setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) =>
      ipcRenderer.send('pet:window:setIgnoreMouseEvents', ignore, options),
    beginDrag: () => ipcRenderer.send('pet:window:beginDrag'),
    dragToCursor: () => ipcRenderer.send('pet:window:dragToCursor'),
    endDrag: () => ipcRenderer.send('pet:window:endDrag'),
    getPosition: () => ipcRenderer.invoke('pet:window:getPosition'),
    getCursorScreenPoint: () => ipcRenderer.invoke('pet:window:getCursorScreenPoint'),
    setSize: (width: number, height: number) => ipcRenderer.send('pet:window:setSize', width, height),
    setModelNames: (names: string[]) => ipcRenderer.send('pet:tray:updateModelNames', names),
    setSizeAnchored: (width: number, height: number) => ipcRenderer.send('pet:window:setSizeAnchored', width, height),
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
  },
} as ElectronAPI);

// Declare global type
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
