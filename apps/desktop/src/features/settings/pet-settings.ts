import { PetConfig, DEFAULT_PET_CONFIG } from '@hermes/shared';

export interface PetSettings extends PetConfig {
  hermesWsUrl: string;
  hermesApiUrl: string;
  startMinimized: boolean;
  autoStart: boolean;
}

export const DEFAULT_SETTINGS: PetSettings = {
  ...DEFAULT_PET_CONFIG,
  hermesWsUrl: 'ws://localhost:8080',
  hermesApiUrl: 'http://localhost:8080',
  startMinimized: false,
  autoStart: false,
};

export function loadSettings(): PetSettings {
  const stored = localStorage.getItem('hermes-pet-settings');
  if (stored) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: Partial<PetSettings>): void {
  const current = loadSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem('hermes-pet-settings', JSON.stringify(updated));
}
