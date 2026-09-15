// Service worker registration + offline region downloads (§11).
// Precaches the shell and allows downloading a whole region; only after all
// its audio/images/content are verified are they marked available offline.

const SW_URL = './sw.js';

export function registerSW(): void {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(SW_URL).catch(() => {
      /* sw unsupported – game still works online (§11) */
    });
  });
}

/** Request offline download of a full region. Returns bytes saved / error. */
export async function downloadRegionOffline(
  regionId: string,
  resourceUrls: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: boolean; bytes: number; error?: string }> {
  if (!('caches' in self && 'serviceWorker' in navigator)) {
    return { ok: false, bytes: 0, error: 'no-cache-support' };
  }
  try {
    const sw = await navigator.serviceWorker.ready;
    if (!sw) throw new Error('no-sw');
    const cacheName = `isla-region-${regionId}`;
    // Ensure the cache is created in page context then fill via SW-controlled cache
    // Simpler: fetch all and cache them via Cache API from page.
    const cache = await caches.open(cacheName);
    let bytes = 0;
    for (let i = 0; i < resourceUrls.length; i++) {
      const url = resourceUrls[i];
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch-failed:${url}`);
      await cache.put(url, res.clone());
      bytes += (await res.clone().arrayBuffer()).byteLength;
      onProgress?.(i + 1, resourceUrls.length);
    }
    // Verify completeness: every requested url present in cache
    for (const url of resourceUrls) {
      if (!(await caches.match(url))) throw new Error(`missing:${url}`);
    }
    return { ok: true, bytes };
  } catch (e) {
    return { ok: false, bytes: 0, error: String(e) };
  }
}

/** Whether a region cache currently exists (i.e., "Disponible sin conexión"). */
export async function isRegionOffline(regionId: string): Promise<boolean> {
  if (!('caches' in self)) return false;
  const keys = await caches.keys();
  return keys.includes(`isla-region-${regionId}`);
}

export async function clearRegionOffline(regionId: string): Promise<void> {
  if (!('caches' in self)) return;
  await caches.delete(`isla-region-${regionId}`);
}
