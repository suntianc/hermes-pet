import { CubismFramework, LogLevel, Option } from '@framework/live2dcubismframework';

let frameworkReady = false;

export function ensureCubismFramework(): void {
  if (frameworkReady) return;

  const option = new Option();
  option.logFunction = (message: string) => console.log(`[Cubism] ${message}`);
  option.loggingLevel = LogLevel.LogLevel_Warning;

  CubismFramework.startUp(option);
  CubismFramework.initialize();
  frameworkReady = true;

  console.log('[Cubism] Framework initialized successfully');
}
