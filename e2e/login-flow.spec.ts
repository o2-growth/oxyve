/**
 * E2E smoke do login — só Google da O2 Inc.
 *
 * Cobertura intencional:
 *   1. Acesso anônimo a rota protegida → redirect /login.
 *   2. /login não oferece e-mail/senha nem cadastro, só o botão do Google.
 *   3. O botão manda para o Google com hd=o2inc.com.br.
 *   4. Recusa do Auth (e-mail fora da O2) aparece na tela.
 *
 * Não fazemos o login real — exigiria uma conta Google interativa. A trava de
 * domínio de verdade é o hook hook_restringe_dominio, testado contra o banco.
 */
import { test, expect } from '@playwright/test';

test.describe('Login só com Google da O2 Inc.', () => {
  test('rota protegida redireciona para /login quando anônimo', async ({ page }) => {
    await page.goto('/app/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('não há formulário de senha nem cadastro', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /entrar com google/i })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /cadastrar/i })).toHaveCount(0);
  });

  test('o botão leva ao Google restrito ao domínio da O2', async ({ page }) => {
    await page.goto('/login');
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/auth/v1/authorize')),
      page.getByRole('button', { name: /entrar com google/i }).click(),
    ]);
    const url = new URL(request.url());
    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('hd')).toBe('o2inc.com.br');
  });

  test('recusa do Auth aparece na tela', async ({ page }) => {
    await page.goto('/login?error=access_denied&error_description=Acesso+restrito+a+contas+Google+da+O2+Inc.');
    await expect(page.getByRole('alert')).toContainText('Acesso restrito');
  });
});
