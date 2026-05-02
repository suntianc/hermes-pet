type WindowMode = 'normal' | 'alwaysOnTop' | 'passthrough';

export class PetWindowController {
  private currentMode: WindowMode = 'normal';

  async show(): Promise<void> {
    window.electronAPI?.petWindow.show();
  }

  async hide(): Promise<void> {
    window.electronAPI?.petWindow.hide();
  }

  async setAlwaysOnTop(flag: boolean): Promise<void> {
    window.electronAPI?.petWindow.setAlwaysOnTop(flag);
    this.currentMode = flag ? 'alwaysOnTop' : 'normal';
  }

  async setPassthrough(enabled: boolean): Promise<void> {
    window.electronAPI?.petWindow.setIgnoreMouseEvents(enabled, { forward: true });
    this.currentMode = enabled ? 'passthrough' : 'normal';
  }

  async getPosition(): Promise<{ x: number; y: number }> {
    return window.electronAPI?.petWindow.getPosition() ?? { x: 0, y: 0 };
  }

  async setPosition(x: number, y: number): Promise<void> {
    window.electronAPI?.petWindow.setPosition(x, y);
  }

  async getSize(): Promise<{ width: number; height: number }> {
    return window.electronAPI?.petWindow.getSize() ?? { width: 360, height: 520 };
  }

  getCurrentMode(): WindowMode {
    return this.currentMode;
  }
}
