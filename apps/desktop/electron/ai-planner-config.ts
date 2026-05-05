import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export type AIPlannerMode = 'rule' | 'ai' | 'hybrid';

export interface AIPlannerConfig {
  enabled: boolean;
  mode: AIPlannerMode;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  fallbackToRule: boolean;
}

const DEFAULT_CONFIG: AIPlannerConfig = {
  enabled: false,
  mode: 'hybrid',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  timeoutMs: 8000,
  fallbackToRule: true,
};

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'ai-planner-config.json');
}

export function getDefaultAIPlannerConfig(): AIPlannerConfig {
  return { ...DEFAULT_CONFIG };
}

export function loadAIPlannerConfig(): AIPlannerConfig {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // Use defaults when config cannot be read.
  }
  return { ...DEFAULT_CONFIG };
}

export function saveAIPlannerConfig(config: AIPlannerConfig): void {
  const configPath = getConfigPath();
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('[AIPlannerConfig] Failed to save config:', err);
  }
}
