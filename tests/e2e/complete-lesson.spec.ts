import { test, expect } from '@playwright/test';

// Full-lesson completion (§14). Drives all 6 activities of lesson 1 with
// retries. Robust: repeatedly click available options until done-dot count
// increases (the runner advances only after a correct answer + 1.4s delay).

async function dotsDone(page) {
  try {
    return await page.locator('.progress .dot.done').count();
  } catch {
    return 0;
  }
}

// Click a button that is visible and enabled; tolerate it detaching.
async function safeClick(page, btn) {
  try {
    if (await btn.isEnabled().catch(() => false)) await btn.click({ timeout: 2000 });
  } catch {
    /* detached or disabled — ignore */
  }
}

/** Click through choice cards / fill inputs until done-dots increase. */
async function resolveCurrentActivity(page) {
  const before = await dotsDone(page);
  for (let it = 0; it < 25; it++) {
    // trace-skip
    const skip = page.getByRole('button', { name: /Omitir el trazado/i });
    if (await skip.isVisible().catch(() => false) && await skip.isEnabled().catch(() => false)) {
      await safeClick(page, skip);
    }
    // listen/read/sentence: image/text cards
    const cards = page.locator('.choices .card');
    const n = await cards.count().catch(() => 0);
    if (n > 0) {
      await cards.nth(it % n).click().catch(() => {});
    }
    // build-word: click POOL tiles (their aria-label is the tile text, not a
    // slot label) to fill slots, then Listo. On wrong order, LessonRun
    // advances on the 3rd error via the assisted path (§6).
    const listo = page.getByRole('button', { name: 'Listo' });
    if (await listo.isVisible().catch(() => false)) {
      // pool tiles = .card buttons that are NOT slots (no slot aria-label)
      const poolSel = "button.card[aria-label]:not([aria-label^='posición']):not([aria-label^='ranura'])";
      // fill solution slots one tile at a time (pool shrinks as we place)
      for (let t = 0; t < 8; t++) {
        const pool = page.locator(poolSel);
        const pc = await pool.count().catch(() => 0);
        if (pc === 0) break;
        const nth = pool.nth(0);
        if (!(await nth.isEnabled().catch(() => false))) break;
        await nth.click().catch(() => {});
        await page.waitForTimeout(120);
      }
      await safeClick(page, listo);
    }
    // write-word: type into input then Listo
    const input = page.locator('input[type=text]');
    if ((await input.count().catch(() => 0)) > 0) {
      await input.first().fill('ala').catch(() => {});
      await safeClick(page, listo);
    }

    // check progress
    const after = await dotsDone(page);
    if (after > before) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

test('completes the full first lesson with accessible trace-skip and earns a sticker', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Jugar/i }).click();
  await page.getByRole('button', { name: /Nuevo perfil/i }).first().click();
  await page.getByLabel(/Nombre del perfil/i).fill('Luna');
  await page.getByLabel(/Confirmo guardar el nombre y el progreso en internet/i).check();
  await page.getByRole('button', { name: /Continuar/i }).click();

  await expect(page.getByRole('button', { name: /Comenzar/i }).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Comenzar/i }).first().click();

  // 6 activities total. Resolve each until all dots done or the completion
  // screen appears (which replaces the progress dots).
  let guard = 0;
  while (guard < 14) {
    if (await page.getByRole('heading', { name: /Lección completada/i }).isVisible().catch(() => false)) break;
    const progressed = await resolveCurrentActivity(page);
    if (!progressed) {
      await page.waitForTimeout(1200);
    }
    guard++;
  }

  // Completion screen + sticker (dots may be gone; that's expected).
  await expect(page.getByRole('heading', { name: /Lección completada/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.sticker-grid')).toBeVisible();
  await page.getByRole('button', { name: /Volver al mapa/i }).click();
  await expect(page.getByText('Tu mapa')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.map-lesson.completed').first()).toBeVisible();
});
