// Identidad local del propietario (device/familia). D1 guarda el HASH del
// código de recuperación; en el dispositivo conservamos el código en claro para
// mostrarlo en la zona de adultos (es el propio equipo del usuario).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface LocalIdentity {
  ownerId: string;
  recoveryCode: string;
  createdAt: number;
}

interface IdentityDB extends DBSchema {
  identity: { key: string; value: LocalIdentity };
}

const DB_NAME = 'isla-identity';
const DB_VERSION = 1;
let dbPromise: Promise<IDBPDatabase<IdentityDB>> | null = null;

function openIdentityDB(): Promise<IDBPDatabase<IdentityDB>> {
  if (!dbPromise) {
    dbPromise = openDB<IdentityDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('identity')) {
          db.createObjectStore('identity', { keyPath: 'ownerId' });
        }
      },
    });
  }
  return dbPromise;
}

export async function getLocalIdentity(): Promise<LocalIdentity | null> {
  try {
    const db = await openIdentityDB();
    const all = await db.getAll('identity');
    return all[0] ?? null;
  } catch {
    return null;
  }
}

export async function saveLocalIdentity(id: LocalIdentity): Promise<void> {
  const db = await openIdentityDB();
  await db.put('identity', id);
}

export async function clearLocalIdentity(): Promise<void> {
  try {
    const db = await openIdentityDB();
    await db.clear('identity');
  } catch {
    /* no-op */
  }
}

/** Genera un código de recuperación de alta entropía (32 bytes, base64url). */
export function generateRecoveryCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  // base64url, sin '=' de relleno
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
