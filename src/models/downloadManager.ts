import { File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';

import { createStore } from '@/hooks/use-store';
import { totalSizeBytes } from '@/models/catalog';
import {
  deleteModelFile,
  modelFileFor,
  modelsDir,
  recordDownloaded,
} from '@/models/storage';
import { DownloadStatus, ModelEntry } from '@/types';

/** Per-model download status keyed by catalogue id. */
export const downloadStore = createStore<Record<string, DownloadStatus>>({});

const controllers = new Map<string, AbortController>();

function setStatus(id: string, status: DownloadStatus): void {
  downloadStore.set({ ...downloadStore.get(), [id]: status });
}

export function getDownloadStatus(id: string): DownloadStatus {
  return downloadStore.get()[id] ?? { state: 'idle' };
}

export function isDownloading(id: string): boolean {
  return getDownloadStatus(id).state === 'downloading';
}

export function cancelDownload(id: string): void {
  controllers.get(id)?.abort();
}

/** True when the device is on a cellular connection (for the mobile-data warning). */
export async function isOnCellular(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.type === Network.NetworkStateType.CELLULAR;
  } catch {
    return false;
  }
}

function isAbortError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.name === 'AbortError' || /abort/i.test(e.message))
  );
}

/**
 * Downloads one file to a temporary `.part`, verifies measured size and
 * sha256 against trusted catalogue values, then moves it to its final name.
 */
async function fetchVerified(
  url: string,
  filename: string,
  expectedSize: number,
  sha256: string,
  signal: AbortSignal,
  emit: (received: number, total: number | null) => void,
): Promise<void> {
  const tempFile = modelFileFor(`${filename}.part`);
  const finalFile = modelFileFor(filename);
  if (tempFile.exists) tempFile.delete();

  const task = File.createDownloadTask(url, tempFile, {
    signal,
    onProgress: ({ bytesWritten, totalBytes }) =>
      emit(bytesWritten, totalBytes > 0 ? totalBytes : null),
  });
  await task.downloadAsync();

  // Validate: measured size first (cheap), then full sha256 (trusted).
  if (!tempFile.exists || tempFile.size <= 0) {
    throw new Error('Download produced an empty file.');
  }
  if (tempFile.size !== expectedSize) {
    throw new Error(
      `File size mismatch (got ${tempFile.size} bytes, expected ` +
        `${expectedSize}) — the file may be corrupt. Try again.`,
    );
  }
  const digest = (await tempFile.digest('SHA-256')).toLowerCase();
  if (digest !== sha256) {
    throw new Error('Checksum verification failed — the downloaded file is corrupt. Try again.');
  }

  if (finalFile.exists) finalFile.delete();
  await tempFile.move(finalFile);
}

/**
 * Downloads a model's GGUF (and its mmproj projector for vision models),
 * verifying each file, then records it as downloaded. Progress is throttled
 * to ~5 updates/s so the bar moves smoothly without re-rendering per network
 * chunk; stage transitions and terminal states always emit immediately.
 */
export async function startDownload(entry: ModelEntry): Promise<void> {
  if (isDownloading(entry.id) || getDownloadStatus(entry.id).state === 'done') return;

  const controller = new AbortController();
  controllers.set(entry.id, controller);

  let doneBytes = 0;
  let stage: 'model' | 'mmproj' = 'model';
  let lastEmit = 0;
  const emit = (received: number, total: number | null, force = false) => {
    const now = Date.now();
    if (!force && now - lastEmit < 200) return;
    lastEmit = now;
    setStatus(entry.id, { state: 'downloading', received, total, doneBytes, stage });
  };
  emit(0, entry.approxSizeBytes, true);

  const cleanupParts = () => {
    for (const name of [entry.filename, entry.mmproj?.filename]) {
      if (!name) continue;
      const part = modelFileFor(`${name}.part`);
      try {
        if (part.exists) part.delete();
      } catch {
        /* best effort */
      }
    }
  };

  try {
    if (!modelsDir.exists) modelsDir.create({ idempotent: true, intermediates: true });

    // Reliable free-space check before starting a multi-hundred-MB transfer.
    const free = Paths.availableDiskSpace;
    const needed = totalSizeBytes(entry);
    if (free > 0 && free < needed * 1.05) {
      controllers.delete(entry.id);
      cleanupParts();
      setStatus(entry.id, {
        state: 'error',
        message:
          `Not enough storage: about ${(needed / 1e9).toFixed(2)} GB needed, ` +
          `${(free / 1e9).toFixed(1)} GB free.`,
      });
      return;
    }

    await fetchVerified(
      entry.url,
      entry.filename,
      entry.approxSizeBytes,
      entry.sha256,
      controller.signal,
      emit,
    );
    doneBytes = entry.approxSizeBytes;

    if (entry.mmproj) {
      stage = 'mmproj';
      emit(0, entry.mmproj.sizeBytes, true);
      await fetchVerified(
        entry.mmproj.url,
        entry.mmproj.filename,
        entry.mmproj.sizeBytes,
        entry.mmproj.sha256,
        controller.signal,
        emit,
      );
    }

    controllers.delete(entry.id);
    setStatus(entry.id, { state: 'done' });
    recordDownloaded(entry.id);
  } catch (e) {
    if (isAbortError(e) || controller.signal.aborted) {
      controllers.delete(entry.id);
      cleanupParts();
      setStatus(entry.id, { state: 'cancelled' });
      return;
    }
    controllers.delete(entry.id);
    cleanupParts();
    setStatus(entry.id, { state: 'error', message: e instanceof Error ? e.message : 'Download failed.' });
  }
}

/** Deletes the file + metadata for a model. The caller must unload it first. */
export function removeDownloaded(id: string): void {
  deleteModelFile(id);
  setStatus(id, { state: 'idle' });
}
