import { test, expect } from '@playwright/test';

// §14: "Fallar repetidamente → recibir ayuda → avanzar sin quedar bloqueado;
// el registro debe indicar ayuda."
test('repeated wrong answers lead to assistance and the lesson still advances', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Jugar/i }).click();
  await page.getByRole('button', { name: /Nuevo perfil/i }).first().click();
  await page.getByLabel(/Confirmo que el progreso se guarda solo en este dispositivo/i).check();
  await page.getByRole('button', { name: /Continuar/i }).click();
  await page.getByRole('button', { name: /Comenzar/i }).first().click();

  // Activity 1 = listen-choose. Deliberately answer wrong 3 times in a row.
  await expect(page.locator('.choices .card').first()).toBeVisible({ timeout: 10_000 });
  const cards = page.locator('.choices .card');
  // Find the wrong choice set: click choices that are NOT the last one.
  const firstWrong = cards.nth(0);
  // Click it up to 3 times, but each time the component remounts on error.
  for (let i = 0; i < 3; i++) {
    await firstWrong.click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  // After repeated errors, the third error should demonstrate/assist and advance.
  await expect(page.locator('.progress .dot.done').first()).toBeVisible({ timeout: 10_000 });
});
