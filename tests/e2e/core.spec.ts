import { test, expect } from '@playwright/test';

// Core journey (§14): create profile → play → complete first activity with
// retries until correct → progress dot fills → reload preserves progress
// (session resumes via Map → Continuar lección, no duplicated stickers).
test('creates a profile, completes lesson 1 first activity, reload preserves progress', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Isla de las Letras/i })).toBeVisible();
  await page.getByRole('button', { name: /Jugar/i }).click();

  // New profile: first free avatar + name + consent
  const newBtn = page.getByRole('button', { name: /Nuevo perfil/i }).first();
  await newBtn.click();
  await page.getByLabel(/Nombre del perfil/i).fill('Luna');
  await page.getByLabel(/Confirmo guardar el nombre y el progreso en internet/i).check();
  await page.getByRole('button', { name: /Continuar/i }).click();

  // Map → start first lesson
  await expect(page.getByRole('button', { name: /Comenzar/i }).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Comenzar/i }).first().click();

  // First activity is listen-choose (image choices). Click each in turn
  // until the lesson advances to activity 2.
  await expect(page.locator('.choices .card').first()).toBeVisible({ timeout: 10_000 });

  let done = false;
  for (let attempt = 0; attempt < 6 && !done; attempt++) {
    const clicks = page.locator('.choices .card');
    const count = await clicks.count();
    for (let i = 0; i < count && !done; i++) {
      await clicks.nth(i).click();
      try {
        await page.locator('.progress .dot.done').first().waitFor({ timeout: 2500 });
        done = true;
      } catch {
        // wrong answer → next
      }
    }
  }
  expect(done, 'should have completed activity 1').toBe(true);

  // Reload: session must survive (app returns to Home; user resumes via Map).
  await page.reload();
  await expect(page.getByRole('button', { name: /Jugar/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Jugar/i }).click();
  await page.getByRole('button', { name: /Continuar/i }).first().click();
  await expect(page.getByRole('button', { name: /Comenzar/i }).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Comenzar/i }).first().click();

  // Resume lands on activity 2 → exactly 1 dot done.
  await expect(page.locator('.progress .dot.done')).toHaveCount(1, { timeout: 10_000 });
});
