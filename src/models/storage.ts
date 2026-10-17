import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { createStore } from '@/hooks/use-store';
import { getModelEntry, MODEL_CATALOG } from '@/models/catalog';
import { StoredModel } from '@/types';

const KEY = 'openpocket.models.v1';

/** Models live in persistent app-private document storage, never the cache. */
export const modelsDir = new Directory(Paths.document, 'models');

export const modelsStore = createStore<StoredModel[]>([]);

export function modelFileFor(filename: string): File {
  return new File(modelsDir, filename);
}

function readMeta(): Promise<StoredModel[]> {
  return AsyncStorage.getItem(KEY).then((raw) => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (m): m is StoredModel =>
          typeof m === 'object' &&
          m !== null &&
          typeof (m as StoredModel).id === 'string' &&
          typeof (m as StoredModel).filename === 'string' &&
          typeof (m as StoredModel).sizeBytes === 'number',
      );
    } catch {
      return [];
    }
  });
}

function writeMeta(models: StoredModel[]): void {
  modelsStore.set(models);
  void AsyncStorage.setItem(KEY, JSON.stringify(models));
}

/**
 * Reconcile persisted metadata with real files on disk.
 * Files recorded but missing are dropped; valid files on disk but not
 * recorded (e.g. metadata cleared) are re-adopted with measured sizes.
 */
export async function reconcileModels(): Promise<void> {
  if (!modelsDir.exists) {
    modelsDir.create({ idempotent: true, intermediates: true });
  }
  const meta = await readMeta();
  const metaById = new Map(meta.map((m) => [m.id, m]));
  const next: StoredModel[] = [];

  for (const cat of MODEL_CATALOG) {
    const file = modelFileFor(cat.filename);
    // Vision models are only complete once the projector file is on disk too.
    const mmprojFile = cat.mmproj ? modelFileFor(cat.mmproj.filename) : null;
    const mmprojOk = !mmprojFile || (mmprojFile.exists && mmprojFile.size > 0);
    if (file.exists && file.size > 0 && mmprojOk) {
      const prev = metaById.get(cat.id);
      next.push({
        id: cat.id,
        filename: cat.filename,
        sizeBytes: file.size, // measured size, not the catalogue estimate
        downloadedAt: prev?.downloadedAt ?? Date.now(),
        mmprojFilename: mmprojFile ? cat.mmproj!.filename : undefined,
        mmprojSizeBytes: mmprojFile ? mmprojFile.size : undefined,
      });
    }
  }
  writeMeta(next);
}

export function listDownloaded(): StoredModel[] {
  return modelsStore.get();
}

export function getDownloaded(id: string): StoredModel | undefined {
  return modelsStore.get().find((m) => m.id === id);
}

export function isDownloaded(id: string): boolean {
  return getDownloaded(id) !== undefined;
}

export function getModelPath(id: string): string | null {
  const stored = getDownloaded(id);
  if (!stored) return null;
  const file = modelFileFor(stored.filename);
  return file.exists && file.size > 0 ? file.uri : null;
}

/** Path of the vision projector (mmproj) file, or null for text-only models. */
export function getModelMmprojPath(id: string): string | null {
  const stored = getDownloaded(id);
  if (!stored?.mmprojFilename) return null;
  const file = modelFileFor(stored.mmprojFilename);
  return file.exists && file.size > 0 ? file.uri : null;
}

export function recordDownloaded(id: string): StoredModel | null {
  const entry = getModelEntry(id);
  if (!entry) return null;
  const file = modelFileFor(entry.filename);
  if (!file.exists || file.size <= 0) return null;
  const mmprojFile = entry.mmproj ? modelFileFor(entry.mmproj.filename) : null;
  if (mmprojFile && !(mmprojFile.exists && mmprojFile.size > 0)) return null;
  const stored: StoredModel = {
    id,
    filename: entry.filename,
    sizeBytes: file.size,
    downloadedAt: Date.now(),
    mmprojFilename: mmprojFile ? entry.mmproj!.filename : undefined,
    mmprojSizeBytes: mmprojFile ? mmprojFile.size : undefined,
  };
  const next = modelsStore.get().filter((m) => m.id !== id);
  next.push(stored);
  writeMeta(next);
  return stored;
}

export function forgetModel(id: string): void {
  writeMeta(modelsStore.get().filter((m) => m.id !== id));
}

/** Deletes the files for a model (incl. vision projector). Caller must unload it first. */
export function deleteModelFile(id: string): boolean {
  const entry = getModelEntry(id);
  if (!entry) return false;
  let ok = true;
  const targets = [entry.filename, `${entry.filename}.part`];
  if (entry.mmproj) targets.push(entry.mmproj.filename, `${entry.mmproj.filename}.part`);
  for (const name of targets) {
    const file = modelFileFor(name);
    if (!file.exists) continue;
    try {
      file.delete();
    } catch {
      if (!name.endsWith('.part')) ok = false;
    }
  }
  if (ok) forgetModel(id);
  return ok;
}

export function totalDownloadedBytes(): number {
  return modelsStore
    .get()
    .reduce((sum, m) => sum + m.sizeBytes + (m.mmprojSizeBytes ?? 0), 0);
}
