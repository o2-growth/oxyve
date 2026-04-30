/**
 * Sprint 3 — E2E smoke do fluxo de login (invite-gated).
 *
 * Cobertura intencional:
 *   1. Acesso anônimo a rota protegida → redirect /login.
 *   2. Sem `?invite=`, a tab "Cadastrar" não aparece.
 *   3. Com `?invite=token-fake`, a tab "Cadastrar" aparece.
 *   4. Login com credenciais inválidas → toast de erro.
 *
 * Não fazemos signup/login real — exigiria fixture user no Supabase.
 * Testes focam em rotas + UI + Zod (camadas client-only).
 */
import { test, expect } from '@playwright/test';

test.describe('Login & invite-only signup', () => {
  test('rota protegida redireciona para /login quando anônimo', async ({ page }) => {
    await page.goto('/app/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('tab "Cadastrar" não aparece sem ?invite= na URL', async ({ page }) => {
    await page.goto('/login');
    // Form de login está sempre presente.
    await expect(page.getByLabel(/email/i)).toBeVisible();
    // Sem invite, nem a tab "Cadastrar" nem a "Entrar" da Tabs renderizam.
    await expect(page.getByRole('tab', { name: /cadastrar/i })).toHaveCount(0);
    await expect(page.getByTestId('signup-tab')).toHaveCount(0);
  });

  test('tab "Cadastrar" aparece com ?invite=<token>', async ({ page }) => {
    await page.goto('/login?invite=token-fake-123');
    await expect(page.getByRole('tab', { name: /cadastrar/i })).toBeVisible();
  });

  test('login com credenciais inválidas mostra erro', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('naoexiste@oxyve.example');
    await page.getByLabel(/senha/i).fill('senhaerrada123');
    await page.getByRole('button', { name: /entrar/i }).click();
    // O toast/sonner aparece com erro do Supabase. Aceita qualquer texto de erro
    // visível (toast pode levar ~1-2s pra renderizar).
    await expect(
      page.locator('[data-sonner-toast], [role="status"]').filter({ hasText: /(invalid|inválid|erro|falh)/i })
    ).toBeVisible({ timeout: 8_000 });
  });
});
