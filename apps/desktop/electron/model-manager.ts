import { app, protocol, net, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import log from 'electron-log';
import { indexModelActions, IndexedModelAction } from './action-index';

const USER_MODELS_DIR = 'models';

type RendererActionConfig = {
  motion?: { group: string; index?: number; file?: string };
  expression?: string;
  expressionFile?: string;
};

type BundledModelConfig = {
  id: string;
  name: string;
  path: string;
};

/**
 * Resolve the absolute path to a user data model file.
 * Maps: vivipet-assets://models/<modelId>/<file> → userData/models/<modelId>/<file>
 */
function resolveUserModelPath(relativePath: string): string {
  return path.join(app.getPath('userData'), USER_MODELS_DIR, relativePath);
}

function resolveSafeUserModelPath(relativePath: string): string | null {
  const modelsRoot = path.resolve(app.getPath('userData'), USER_MODELS_DIR);
  const resolvedPath = path.resolve(modelsRoot, relativePath);
  const relativeToRoot = path.relative(modelsRoot, resolvedPath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    return null;
  }
  return resolvedPath;
}

/**
 * Initialize the vivipet-assets protocol for serving user-imported model files.
 * This allows the renderer to fetch user models via `vivipet-assets://models/...`
 * URLs that map to files in the userData directory.
 */
export function initModelProtocol(): void {
  protocol.handle('vivipet-assets', (request) => {
    try {
      const url = new URL(request.url);
      // url.pathname is like /models/<modelId>/texture_00.png
      const filePath = resolveSafeUserModelPath(decodeURIComponent(url.pathname.replace(/^\//, '')));
      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('Not found', { status: 404 });
      }
      return net.fetch(pathToFileURL(filePath));
    } catch {
      return new Response('Error reading file', { status: 500 });
    }
  });
  log.info('[ModelManager] vivipet-assets protocol registered');
}

function pathToFileURL(filePath: string): string {
  // Simple file:// URL construction (avoids url module dependency)
  return 'file://' + filePath.replace(/\\/g, '/');
}

function resolveBundledModelPath(modelPath: string): string | null {
  if (modelPath.startsWith('vivipet-assets://')) return null;

  const cleanPath = modelPath.replace(/^\.\//, '').replace(/^\//, '');
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, cleanPath)]
    : [
        path.join(app.getAppPath(), 'public', cleanPath),
        path.join(process.cwd(), 'public', cleanPath),
      ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function copyDirectoryIfExists(srcDir: string, destDir: string): void {
  if (!fs.existsSync(srcDir)) return;

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryIfExists(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function findFiles(dir: string, predicate: (filePath: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];

  const result: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...findFiles(entryPath, predicate));
    } else if (predicate(entryPath)) {
      result.push(entryPath);
    }
  }
  return result;
}

function toModelId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'imported_model';
}

/**
 * Open a file dialog for the user to select a ViviPet model zip package,
 * then validate and copy the model files into the userData directory.
 * Returns the imported model's config, or null if cancelled/error.
 */
export async function importModelViaDialog(): Promise<{
  id: string;
  name: string;
  path: string;
  window?: { width: number; height: number };
  actions?: Record<string, RendererActionConfig>;
} | null> {
  const result = await dialog.showOpenDialog({
    title: 'Select ViviPet Model Package',
    properties: ['openFile'],
    filters: [{ name: 'ViviPet Model Package (.zip)', extensions: ['zip'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return importModelZip(result.filePaths[0]);
}

/**
 * Import a model from a .zip package.
 * Currently stubbed — .riv model import will be implemented in Phase 4.
 */
async function importModelZip(_zipPath: string): Promise<{
  id: string;
  name: string;
  path: string;
  window?: { width: number; height: number };
  actions?: Record<string, RendererActionConfig>;
} | null> {
  console.warn('[model-manager] .zip import not yet supported for .riv models (Phase 4)');
  return null;
}

/**
 * Scan userData/models/ for imported models and return their configs.
 * Stubbed for Phase 3 — Phase 4 (MODEL-03) will reimplement for .riv files.
 */
export function listUserModels(): Array<{
  id: string;
  name: string;
  path: string;
  window?: { width: number; height: number };
  actions?: Record<string, RendererActionConfig>;
}> {
  console.warn('[model-manager] listUserModels stubbed — Phase 4 will reimplement for .riv');
  return [];
}

export function indexBundledModels(models: BundledModelConfig[]): void {
  for (const model of models) {
    const modelPath = resolveBundledModelPath(model.path);
    if (!modelPath) continue;

    indexModelActions({
      modelId: model.id,
      name: model.name,
      modelPath,
      rootDir: path.dirname(modelPath),
    });
  }
}

function toRendererActions(actions: IndexedModelAction[]): Record<string, RendererActionConfig> {
  const result: Record<string, RendererActionConfig> = {};

  for (const action of actions) {
    if (action.type === 'motion') {
      result[action.name] = {
        motion: {
          group: action.groupName || action.name,
          index: action.indexNo ?? 0,
          file: action.filePath,
        },
      };
    } else {
      result[action.name] = { expression: action.name, expressionFile: action.filePath };
    }
  }

  return result;
}
