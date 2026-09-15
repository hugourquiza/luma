// Loads content JSON from public/content under demand (§10).
import type { Activity, Lesson } from './types';

export interface RegionMeta {
  id: string;
  name: string;
  color: string;
  lessonCount: number;
}

export interface Region extends RegionMeta {
  lessons: Lesson[];
}

/** Fetch a region (and its lessons) from public/content/<id>.json. */
export async function loadRegion(id: string): Promise<Region> {
  const res = await fetch(`./content/${id}.json`);
  if (!res.ok) throw new Error(`No se pudo cargar la región ${id}`);
  return (await res.json()) as Region;
}

export async function loadRegionIndex(): Promise<RegionMeta[]> {
  const res = await fetch('./content/index.json');
  if (!res.ok) return [];
  const data = (await res.json()) as { regions: RegionMeta[] };
  return data.regions ?? [];
}

/** Resolve an activity by id across the whole index (search each region). */
export async function findActivity(regionId: string, activityId: string): Promise<Activity | undefined> {
  const region = await loadRegion(regionId);
  for (const l of region.lessons) {
    const a = l.activities.find((x: Activity) => x.id === activityId);
    if (a) return a;
  }
  return undefined;
}

export function getLessonById(region: Region, lessonId: string): Lesson | undefined {
  return region.lessons.find((l) => l.id === lessonId);
}
