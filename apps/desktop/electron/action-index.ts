import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

type Database = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  };
};

const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => Database;
};

export interface IndexedModelAction {
  modelId: string;
  name: string;
  type: 'motion' | 'expression';
  groupName?: string;
  indexNo?: number;
  filePath: string;
  displayName: string;
  source: 'model3_json' | 'motion_folder' | 'expression_folder';
}

let db: Database | null = null;
let currentModelId = '';

function getDb(): Database {
  if (db) return db;

  const dbPath = path.join(app.getPath('userData'), 'vivipet.sqlite');
  db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model_path TEXT NOT NULL,
      root_dir TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_actions (
      model_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('motion', 'expression')),
      group_name TEXT,
      index_no INTEGER,
      file_path TEXT NOT NULL,
      display_name TEXT NOT NULL,
      source TEXT NOT NULL,
      PRIMARY KEY (model_id, name, type),
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_model_actions_model_id
      ON model_actions(model_id);
  `);
  return db;
}

function normalizeActionName(filePath: string, suffix: string): string {
  return path.basename(filePath, suffix).trim();
}

export function initActionIndex(): void {
  getDb();
  log.info('[ActionIndex] SQLite action index initialized');
}

export function setCurrentModelId(modelId: string): void {
  currentModelId = modelId;
}

export function getCurrentModelId(): string {
  return currentModelId;
}

export function indexModelActions(options: {
  modelId: string;
  name: string;
  modelPath: string;
  rootDir: string;
}): IndexedModelAction[] {
  const database = getDb();
  const updatedAt = new Date().toISOString();
  const actions = scanModelActions(options.modelId, options.modelPath);

  database.prepare(`
    INSERT INTO models (id, name, model_path, root_dir, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      model_path = excluded.model_path,
      root_dir = excluded.root_dir,
      updated_at = excluded.updated_at
  `).run(options.modelId, options.name, options.modelPath, options.rootDir, updatedAt);

  database.prepare('DELETE FROM model_actions WHERE model_id = ?').run(options.modelId);

  const insert = database.prepare(`
    INSERT INTO model_actions (
      model_id, name, type, group_name, index_no, file_path, display_name, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const action of actions) {
    insert.run(
      action.modelId,
      action.name,
      action.type,
      action.groupName ?? null,
      action.indexNo ?? null,
      action.filePath,
      action.displayName,
      action.source,
    );
  }

  log.info(`[ActionIndex] Indexed ${actions.length} actions for model ${options.modelId}`);
  return actions;
}

export function scanModelActions(modelId: string, modelPath: string): IndexedModelAction[] {
  const byKey = new Map<string, IndexedModelAction>();
  const addAction = (action: IndexedModelAction) => {
    const key = `${action.type}:${action.name}`;
    if (!byKey.has(key)) {
      byKey.set(key, action);
    }
  };

  try {
    const raw = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));
    const motions = raw.FileReferences?.Motions ?? {};
    for (const [groupName, groupMotions] of Object.entries(motions) as Array<[string, Array<{ File?: string }>]>) {
      groupMotions.forEach((motion, indexNo) => {
        if (!motion.File) return;
        const name = normalizeActionName(motion.File, '.motion3.json');
        addAction({
          modelId,
          name,
          type: 'motion',
          groupName,
          indexNo,
          filePath: motion.File.replace(/\\/g, '/'),
          displayName: name,
          source: 'model3_json',
        });
      });
    }

  } catch (err) {
    log.warn(`[ActionIndex] Failed to parse model3 actions: ${modelPath}`, err);
  }

  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function listModelActions(modelId: string): IndexedModelAction[] {
  if (!modelId) return [];
  const rows = getDb().prepare(`
    SELECT
      model_id as modelId,
      name,
      type,
      group_name as groupName,
      index_no as indexNo,
      file_path as filePath,
      display_name as displayName,
      source
    FROM model_actions
    WHERE model_id = ?
    ORDER BY type, name
  `).all(modelId);
  return rows as IndexedModelAction[];
}

export function listCurrentModelActions(): { modelId: string; actions: IndexedModelAction[] } {
  return {
    modelId: currentModelId,
    actions: listModelActions(currentModelId),
  };
}
