/**
 * Telas logadas com backend falso (e2e/support/mockSupabase.ts):
 * navegação por tamanho de tela, item Gestão por papel e o seletor de
 * categoria agrupado por setor.
 */
import { test, expect, devices } from '@playwright/test';
import { mockSupabase } from './support/mockSupabase';

test.describe('celular', () => {
  test.use({ viewport: devices['iPhone 13'].viewport, isMobile: true, hasTouch: true });

  test('barra inferior com os 5 slots e sem menu lateral', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/app/dashboard');

    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    await expect(nav).toBeVisible();
    for (const label of ['Início', 'Despesas', 'Relatórios', 'Mais']) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(nav.getByRole('button', { name: 'Capturar despesa por foto' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recolher ou expandir menu' })).toBeHidden();
  });
});

test.describe('computador', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('barra inferior some e o menu lateral aparece', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/app/dashboard');

    await expect(page.getByRole('link', { name: 'Despesas' }).first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeHidden();
  });

  test('colaborador não vê Gestão; admin vê', async ({ page }) => {
    await mockSupabase(page, { role: 'employee' });
    await page.goto('/app/dashboard');
    await expect(page.getByRole('link', { name: 'Despesas' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Gestão' })).toHaveCount(0);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await mockSupabase(page, { role: 'admin' });
    await page.reload();
    await expect(page.getByRole('link', { name: 'Gestão' })).toBeVisible();
  });

  test('gestor entra em Gestão, mas sem as abas de cadastro', async ({ page }) => {
    await mockSupabase(page, { role: 'manager' });
    await page.goto('/app/dashboard');
    await page.getByRole('link', { name: 'Gestão' }).click();

    await expect(page.getByRole('tab', { name: 'Financeiro' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Usuários' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Categorias' })).toHaveCount(0);
  });

  test('categorias aparecem agrupadas por setor, com Geral por último', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/app/expenses');

    await page.getByRole('button', { name: 'Vários dias' }).click();
    await page.getByRole('combobox').filter({ hasText: 'Escolha a categoria' }).click();

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const groups = await listbox.getByRole('group').evaluateAll((els) =>
      els.map((el) => el.firstElementChild?.textContent?.trim()),
    );
    expect(groups).toEqual(['Administrativo', 'Comercial', 'Geral']);

    const comercial = listbox.getByRole('group').nth(1).getByRole('option');
    await expect(comercial).toHaveText(['Alimentação – Comercial', 'Deslocamento – Comercial']);
  });
});
