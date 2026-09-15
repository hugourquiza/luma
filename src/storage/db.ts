// IndexedDB data layer via `idb` (§11). Transactional, versioned.
// Schema versioning with migrations. All profile-scoped progress lives under
// a single db with profileId keys.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface Profile {
  id: string;
  avatarId: string;
  displayName?: string;
  createdAt: number;
}

export interface Settings {
  id?: string;
  volume: number; // 0..1
  muted: boolean;
  textScale: number; // 1 | 2
  reduceMotion: boolean;
  traceAssist?: boolean;
  activeProfileId?: string | null;
}

export interface Attempt {
  id: string; // unique UUID
  sessionId: string;
  activityId: string;
  profileId: string;
  outcome: 'independent' | 'assisted' | 'error';
  retries: number;
  assists: number;
  timestamp: number;
}

export interface Session {
  id: string;
  profileId: string;
  regionId: string;
  lessonId: string;
  activityOrder: string[]; // ordered activity ids for this lesson run
  currentIndex: number;
  startedAt: number;
  updatedAt: number;
}

export interface SkillProgress {
  id?: string; // composite "profileId:skillId"
  skillId: string;
  profileId: string;
  independent: number;
  assisted: number;
  errors: number;
  last5: boolean[];
  sessions: Set<string>; // session ids where practiced
}

export interface LessonProgress {
  id?: string; // composite "profileId:lessonId"
  lessonId: string;
  profileId: string;
  completed: boolean;
  lastCompletedAt?: number;
  // how many independent corrects recorded across completed runs
  independentCount: number;
}

export interface CollectionItem {
  id?: string; // composite "profileId:stickerId"
  stickerId: string;
  profileId: string;
  earnedAt: number;
}

interface IslandDBSchema extends DBSchema {
  profiles: { key: string; value: Profile };
  settings: { key: string; value: Settings };
  attempts: { key: string; value: Attempt };
  sessions: { key: string; value: Session };
  skillProgress: { key: string; value: SkillProgress };
  lessonProgress: { key: string; value: LessonProgress };
  collection: { key: string; value: CollectionItem };
}

const DB_NAME = 'isla-de-las-letras';
const DB_VERSION = 1;
let dbPromise: Promise<IDBPDatabase<IslandDBSchema>> | null = null;

export function openIslandDB(): Promise<IDBPDatabase<IslandDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<IslandDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('attempts')) db.createObjectStore('attempts', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('skillProgress')) db.createObjectStore('skillProgress', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('lessonProgress')) db.createObjectStore('lessonProgress', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('collection')) db.createObjectStore('collection', { keyPath: 'id', autoIncrement: true });
      },
    });
  }
  return dbPromise;
}

/** Full transactional save of a lesson run state + progress (§11: single txn). */
export async function saveSessionProgress(
  _profileId: string,
  session: Session,
  attemptsToStore: Attempt[],
): Promise<void> {
  const db = await openIslandDB();
  const tx = db.transaction(['sessions', 'attempts'], 'readwrite');
  await Promise.all([
    tx.done,
    tx.objectStore('sessions').put(session),
    ...attemptsToStore.map((a) => tx.objectStore('attempts').put(a)),
  ]);
}

export async function getSession(profileId: string): Promise<Session | undefined> {
  const db = await openIslandDB();
  // sessions keyed by id; find by profileId
  const all = await db.getAll('sessions');
  return all.find((s) => s.profileId === profileId && s.currentIndex < s.activityOrder.length);
}

export async function saveProfile(p: Profile): Promise<void> {
  const db = await openIslandDB();
  await db.put('profiles', p);
}
export async function getProfiles(): Promise<Profile[]> {
  const db = await openIslandDB();
  return db.getAll('profiles');
}

export async function saveSettings(s: Settings): Promise<void> {
  const db = await openIslandDB();
  await db.put('settings', { id: 'main', ...s });
}
export async function getSettings(): Promise<Settings> {
  const db = await openIslandDB();
  const s = await db.get('settings', 'main');
  return s ?? { id: 'main', volume: 1, muted: false, textScale: 1, reduceMotion: false };
}

export async function saveSkillProgress(sp: SkillProgress): Promise<void> {
  const db = await openIslandDB();
  // composite key: profileId + skillId (store on 'id')
  await db.put('skillProgress', { ...sp, id: `${sp.profileId}:${sp.skillId}` });
}
export async function getSkillProgress(profileId: string): Promise<SkillProgress[]> {
  const db = await openIslandDB();
  const all = await db.getAll('skillProgress');
  return all.filter((x) => x.profileId === profileId);
}

export async function getRecentAttempts(profileId: string, limit = 200): Promise<Attempt[]> {
  const db = await openIslandDB();
  const all = await db.getAll('attempts');
  return all.filter((a) => a.profileId === profileId).sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

export async function saveLessonProgress(lp: LessonProgress): Promise<void> {
  const db = await openIslandDB();
  await db.put('lessonProgress', { ...lp, id: `${lp.profileId}:${lp.lessonId}` });
}

/** All lesson-progress records for a profile. */
export async function getLessonProgress(profileId: string): Promise<LessonProgress[]> {
  const db = await openIslandDB();
  const all = await db.getAll('lessonProgress');
  return all.filter((x) => x.profileId === profileId);
}

export async function addSticker(profileId: string, stickerId: string, earnedAt: number): Promise<void> {
  const db = await openIslandDB();
  const all = await db.getAll('collection');
  if (all.some((c) => c.profileId === profileId && c.stickerId === stickerId)) return; // no dup §6
  await db.add('collection', { profileId, stickerId, earnedAt, id: `${profileId}:${stickerId}` });
}

export async function getCollection(profileId: string): Promise<string[]> {
  const db = await openIslandDB();
  const all = await db.getAll('collection');
  return all.filter((c) => c.profileId === profileId).map((c) => c.stickerId);
}

/** Export all data for a profile as plain JSON (adult zone §12). */
export async function exportProfileData(profileId: string): Promise<unknown> {
  const db = await openIslandDB();
  const profiles = await getProfiles();
  const [attempts, skills, lessons, collection] = await Promise.all([
    db.getAll('attempts'),
    db.getAll('skillProgress'),
    db.getAll('lessonProgress'),
    db.getAll('collection'),
  ]);
  return {
    version: 1,
    exportedAt: Date.now(),
    profile: profiles.find((p) => p.id === profileId),
    attempts: attempts.filter((a) => a.profileId === profileId),
    skillProgress: skills.filter((s) => s.profileId === profileId),
    lessonProgress: lessons.filter((l) => l.profileId === profileId),
    collection: collection.filter((c) => c.profileId === profileId),
  };
}

/** Delete all data for one profile; keep others (§12). */
export async function deleteProfileData(profileId: string): Promise<void> {
  const db = await openIslandDB();
  const tx = db.transaction(['attempts', 'sessions', 'skillProgress', 'lessonProgress', 'collection', 'profiles'], 'readwrite');
  const ops: Promise<unknown>[] = [tx.done];
  for (const st of ['attempts', 'sessions', 'skillProgress', 'lessonProgress', 'collection'] as const) {
    const all = await tx.objectStore(st).getAll();
    for (const rec of all) {
      if ((rec as { profileId?: string }).profileId === profileId && rec.id) {
        ops.push(tx.objectStore(st).delete(rec.id));
      }
    }
  }
  ops.push(tx.objectStore('profiles').delete(profileId));
  await Promise.all(ops);
}
