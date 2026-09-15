// Cola durable de operaciones pendientes en IndexedDB. Las escrituras se
// guardan aquí ANTES de enviarlas a la API; si la red falla, quedan visibles y
// se reintentan al reconectar o al abrir la app. No dependemos de beforeunload.
//
// La caché local de progreso (storage/db.ts) sigue siendo un reflejo; la
// fuente de verdad del progreso confirmado es D1. Los payloads son los DTOs de
// request ya versionados y serializables.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { profileApi } from './client';
import type { SaveCheckpointRequest, CompleteLessonRequest } from '../shared/schema';

export type PendingOp =
  | {
      id: string;
      kind: 'checkpoint';
      profileId: string;
      payload: SaveCheckpointRequest;
    }
  | {
      id: string;
      kind: 'complete';
      profileId: string;
      payload: CompleteLessonRequest;
    }
  | {
      id: string;
      kind: 'createProfile';
      profileId: string;
      payload: { displayName: string; avatarId: string; id?: string };
    };

interface SyncDB extends DBSchema {
  pending: { key: string; value: PendingOp };
}

const DB_NAME = 'isla-sync';
const DB_VERSION = 1;
let dbPromise: Promise<IDBPDatabase<SyncDB>> | null = null;

function openSyncDB(): Promise<IDBPDatabase<SyncDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SyncDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pending')) {
          db.createObjectStore('pending', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

/** Guarda una operación pendiente de forma durable antes de enviarla. */
export async function enqueueOp(op: PendingOp): Promise<void> {
  try {
    const db = await openSyncDB();
    await db.put('pending', op);
  } catch {
    // IndexedDB no disponible: seguimos en línea sin respaldo offline.
    console.warn('Sin respaldo offline para operaciones pendientes');
  }
}

/** Número de operaciones pendientes sin enviar (para estados "pendiente"). */
export async function pendingCount(): Promise<number> {
  try {
    const db = await openSyncDB();
    return await db.count('pending');
  } catch {
    return 0;
  }
}

async function listPending(): Promise<PendingOp[]> {
  const db = await openSyncDB();
  return await db.getAll('pending');
}

async function dequeue(id: string): Promise<void> {
  const db = await openSyncDB();
  await db.delete('pending', id);
}

async function applyOp(op: PendingOp): Promise<void> {
  switch (op.kind) {
    case 'checkpoint':
      await profileApi.saveCheckpoint(op.profileId, op.payload);
      return;
    case 'complete':
      await profileApi.completeLesson(op.profileId, op.payload);
      return;
    case 'createProfile':
      await profileApi.createProfile(op.payload.displayName, op.payload.avatarId, op.payload.id);
      return;
  }
}

/**
 * Envía todas las operaciones pendientes en orden. En cuanto falla la red
 * (OfflineError) o cualquier error transitorio, deja el resto en la cola y
 * devuelve cuántas quedaron sin enviar. Los errores de validación remota
 * (400/404/401) NO son reintentables: se descartan para no bloquear la cola.
 */
export async function flushQueue(): Promise<{ synced: number; remaining: number }> {
  const ops = await listPending();
  let synced = 0;
  for (const op of ops) {
    try {
      await applyOp(op);
      await dequeue(op.id);
      synced++;
    } catch (e) {
      // Error no transitorio de la API: la operación ya no tiene sentido.
      if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status >= 400) {
        await dequeue(op.id);
        continue;
      }
      // Sin conexión u otro error transitorio: detener, reintentar después.
      break;
    }
  }
  return { synced, remaining: ops.length - synced };
}

/**
 * Arranca la sincronización de pendientes: al abrir la app, y cuando el
 * navegador recupera la conexión o la pestaña vuelve a ser visible.
 */
export function startSync(): void {
  void flushQueue();
  window.addEventListener('online', () => {
    void flushQueue();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushQueue();
  });
}
