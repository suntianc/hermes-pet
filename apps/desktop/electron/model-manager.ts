import { app, protocol, net, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';

const USER_MODELS_DIR = 'models';

/**
 * Resolve the absolute path to a user data model file.
 * Maps: vivipet-assets://models/<modelId>/<file> → userData/models/<modelId>/<file>
 */
function resolveUserModelPath(relativePath: string): string {
  return path.join(app.getPath('userData'), USER_MODELS_DIR, relativePath);
}

/**
 * Initialize the vivipet-assets protocol for serving user-imported model files.
 * This allows the renderer to fetch user models via `vivipet-assets://models/...`
 * URLs that map to files in the userData directory.
 */
export function initModelProtocol(): void {
  protocol.handle('vivipet-assets', (request) => {
    const url = new URL(request.url);
    // url.pathname is like /models/<modelId>/texture_00.png
    const filePath = resolveUserModelPath(url.pathname.replace(/^\//, ''));
    try {
      if (!fs.existsSync(filePath)) {
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

/**
 * Parse a model3.json to find all referenced files relative to it.
 */
function parseModel3References(model3Path: string): {
  dir: string;
  modelId: string;
  files: string[];
  windowSize?: { width: number; height: number };
} {
  const raw = JSON.parse(fs.readFileSync(model3Path, 'utf-8'));
  const dir = path.dirname(model3Path);
  const files: string[] = [];
  const refs = raw.FileReferences || {};

  // Collect all referenced files
  if (refs.Moc) files.push(refs.Moc);
  if (refs.Physics) files.push(refs.Physics);
  if (refs.Textures) {
    for (const tex of refs.Textures) files.push(tex);
  }
  if (refs.Expressions) {
    for (const expr of refs.Expressions) {
      if (expr.File) files.push(expr.File);
    }
  }
  if (refs.Motions) {
    for (const group of Object.values(refs.Motions) as Array<Array<{ File?: string }>>) {
      for (const motion of group) {
        if (motion.File) files.push(motion.File);
      }
    }
  }

  // Derive a model ID from the directory name
  const dirName = path.basename(dir);
  const modelId = dirName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'imported_model';

  // Try to extract canvas size from model3.json layout
  let windowSize: { width: number; height: number } | undefined;
  if (raw.Metrics) {
    windowSize = { width: raw.Metrics.Width || 500, height: raw.Metrics.Height || 500 };
  }

  return { dir, modelId, files, windowSize };
}

/**
 * Open a file dialog for the user to select a model3.json,
 * then copy the model files into the userData directory.
 * Returns the imported model's config, or null if cancelled/error.
 */
export async function importModelViaDialog(): Promise<{
  id: string;
  name: string;
  path: string;
  window?: { width: number; height: number };
} | null> {
  const result = await dialog.showOpenDialog({
    title: 'Select Live2D Model',
    properties: ['openFile'],
    filters: [{ name: 'Live2D Model (model3.json)', extensions: ['json'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  return importModelFromPath(selectedPath);
}

/**
 * Import a model from a selected model3.json path.
 * Copies all model files into userData/models/<modelId>/.
 */
export async function importModelFromPath(model3Path: string): Promise<{
  id: string;
  name: string;
  path: string;
  window?: { width: number; height: number };
} | null> {
  try {
    const info = parseModel3References(model3Path);

    // Create target directory
    const targetDir = resolveUserModelPath(info.modelId);
    fs.mkdirSync(targetDir, { recursive: true });

    // Copy model3.json and all referenced files
    const model3Dest = path.join(targetDir, path.basename(model3Path));
    fs.copyFileSync(model3Path, model3Dest);

    for (const relFile of info.files) {
      const srcFile = path.join(info.dir, relFile);
      const destFile = path.join(targetDir, relFile);
      const destParent = path.dirname(destFile);
      if (!fs.existsSync(destParent)) {
        fs.mkdirSync(destParent, { recursive: true });
      }
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, destFile);
      } else {
        log.warn(`[ModelManager] Referenced file not found: ${srcFile}`);
      }
    }

    // Write registry metadata
    const registry = {
      id: info.modelId,
      name: info.modelId,
      sourcePath: model3Path,
      importedAt: new Date().toISOString(),
      model3File: path.basename(model3Path),
      window: info.windowSize,
    };
    fs.writeFileSync(path.join(targetDir, '.vivipet-registry.json'), JSON.stringify(registry, null, 2));

    log.info(`[ModelManager] Model imported: ${info.modelId} → ${targetDir}`);
    return {
      id: info.modelId,
      name: info.modelId,
      path: `vivipet-assets://models/${info.modelId}/${path.basename(model3Path)}`,
      window: info.windowSize,
    };
  } catch (err) {
    log.error(`[ModelManager] Failed to import model: ${err}`);
    return null;
  }
}

/**
 * Scan userData/models/ for imported models and return their configs.
 * Looks for .vivipet-registry.json in each subdirectory.
 */
export function listUserModels(): Array<{
  id: string;
  name: string;
  path: string;
  window?: { width: number; height: number };
}> {
  const modelsDir = resolveUserModelPath('');
  if (!fs.existsSync(modelsDir)) {
    return [];
  }

  const entries = fs.readdirSync(modelsDir, { withFileTypes: true });
  const models: Array<{
    id: string;
    name: string;
    path: string;
    window?: { width: number; height: number };
  }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const registryPath = path.join(modelsDir, entry.name, '.vivipet-registry.json');
    if (!fs.existsSync(registryPath)) continue;

    try {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      models.push({
        id: registry.id || entry.name,
        name: registry.name || entry.name,
        path: `vivipet-assets://models/${registry.id || entry.name}/${registry.model3File || `${entry.name}.model3.json`}`,
        window: registry.window,
      });
    } catch (err) {
      log.warn(`[ModelManager] Failed to read registry: ${registryPath}`, err);
    }
  }

  return models;
}

/**
 * Remove an imported model by ID.
 */
export function removeUserModel(modelId: string): boolean {
  const modelDir = resolveUserModelPath(modelId);
  if (!fs.existsSync(modelDir)) {
    log.warn(`[ModelManager] Model directory not found: ${modelDir}`);
    return false;
  }

  try {
    fs.rmSync(modelDir, { recursive: true, force: true });
    log.info(`[ModelManager] Model removed: ${modelId}`);
    return true;
  } catch (err) {
    log.error(`[ModelManager] Failed to remove model: ${err}`);
    return false;
  }
}
