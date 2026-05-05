import { app, protocol, net, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import log from 'electron-log';
import extractZip from 'extract-zip';
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

function findPackagedModel3(rootDir: string): string {
  const model3Files = findFiles(rootDir, (filePath) => filePath.endsWith('.model3.json'));
  if (model3Files.length === 0) {
    throw new Error('No .model3.json file found in the model package');
  }
  if (model3Files.length > 1) {
    throw new Error(`Expected exactly one .model3.json file, found ${model3Files.length}`);
  }
  return model3Files[0];
}

function validateModelPackage(model3Path: string): void {
  const info = parseModel3References(model3Path);
  const missingFiles = info.files.filter((relFile) => !fs.existsSync(path.join(info.dir, relFile)));
  if (missingFiles.length > 0) {
    throw new Error(`Missing referenced model files: ${missingFiles.join(', ')}`);
  }

  const motionDir = path.join(info.dir, 'motion');
  if (!fs.existsSync(motionDir) || !fs.statSync(motionDir).isDirectory()) {
    throw new Error('Model package must include a motion/ directory');
  }

  const idleMotion = path.join(motionDir, 'idle.motion3.json');
  if (!fs.existsSync(idleMotion)) {
    throw new Error('Model package must include motion/idle.motion3.json');
  }
}

function toModelId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'imported_model';
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
  const modelId = toModelId(dirName);

  // Try to extract canvas size from model3.json layout
  let windowSize: { width: number; height: number } | undefined;
  if (raw.Metrics) {
    windowSize = { width: raw.Metrics.Width || 500, height: raw.Metrics.Height || 500 };
  }

  return { dir, modelId, files, windowSize };
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

async function importModelZip(zipPath: string): Promise<{
  id: string;
  name: string;
  path: string;
  window?: { width: number; height: number };
  actions?: Record<string, RendererActionConfig>;
} | null> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivipet-model-'));

  try {
    await extractZip(zipPath, { dir: tempDir });
    const model3Path = findPackagedModel3(tempDir);
    validateModelPackage(model3Path);
    const packageRoot = path.dirname(model3Path);
    const modelIdHint = packageRoot === tempDir
      ? toModelId(path.basename(zipPath, path.extname(zipPath)))
      : undefined;
    return importModelFromPath(model3Path, zipPath, modelIdHint);
  } catch (err) {
    log.error(`[ModelManager] Failed to import model package: ${err}`);
    return null;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Import a model from a selected model3.json path.
 * Copies all model files into userData/models/<modelId>/.
 */
async function importModelFromPath(model3Path: string, sourcePath = model3Path, modelIdHint?: string): Promise<{
  id: string;
  name: string;
  path: string;
  window?: { width: number; height: number };
  actions?: Record<string, RendererActionConfig>;
} | null> {
  try {
    const info = parseModel3References(model3Path);
    if (modelIdHint) {
      info.modelId = modelIdHint;
    }

    // Create target directory
    const targetDir = resolveUserModelPath(info.modelId);
    fs.rmSync(targetDir, { recursive: true, force: true });
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

    // ViviPet model package convention: every custom action lives under motion/.
    // Copy the whole folder so unreferenced motion files can still be indexed and played.
    copyDirectoryIfExists(path.join(info.dir, 'motion'), path.join(targetDir, 'motion'));
    copyDirectoryIfExists(path.join(info.dir, 'expression'), path.join(targetDir, 'expression'));

    // Write registry metadata
    const registry = {
      id: info.modelId,
      name: info.modelId,
      sourcePath,
      importedAt: new Date().toISOString(),
      model3File: path.basename(model3Path),
      window: info.windowSize,
    };
    fs.writeFileSync(path.join(targetDir, '.vivipet-registry.json'), JSON.stringify(registry, null, 2));

    const actions = indexModelActions({
      modelId: info.modelId,
      name: info.modelId,
      modelPath: model3Dest,
      rootDir: targetDir,
    });

    log.info(`[ModelManager] Model imported: ${info.modelId} → ${targetDir}`);
    return {
      id: info.modelId,
      name: info.modelId,
      path: `vivipet-assets://models/${info.modelId}/${path.basename(model3Path)}`,
      window: info.windowSize,
      actions: toRendererActions(actions),
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
  actions?: Record<string, RendererActionConfig>;
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
    actions?: Record<string, RendererActionConfig>;
  }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const registryPath = path.join(modelsDir, entry.name, '.vivipet-registry.json');
    if (!fs.existsSync(registryPath)) continue;

    try {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      const id = registry.id || entry.name;
      const model3File = registry.model3File || `${entry.name}.model3.json`;
      const rootDir = path.join(modelsDir, entry.name);
      const model3Path = path.join(rootDir, model3File);
      const actions = indexModelActions({
        modelId: id,
        name: registry.name || entry.name,
        modelPath: model3Path,
        rootDir,
      });
      models.push({
        id,
        name: registry.name || entry.name,
        path: `vivipet-assets://models/${id}/${model3File}`,
        window: registry.window,
        actions: toRendererActions(actions),
      });
    } catch (err) {
      log.warn(`[ModelManager] Failed to read registry: ${registryPath}`, err);
    }
  }

  return models;
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
