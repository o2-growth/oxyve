/**
 * C3 — send-email inclui o link da notificação (texto e HTML), com URL
 * absoluta montada a partir de APP_URL.
 */
import { describe, it, expect } from 'vitest';
import { buildEmailContent, resolveAppLink } from '../../supabase/functions/send-email/content.ts';

const APP = 'https://oxyve.vercel.app';

describe('resolveAppLink', () => {
  it('monta URL absoluta para link relativo', () => {
    expect(resolveAppLink('/app/reports/abc', APP)).toBe('https://oxyve.vercel.app/app/reports/abc');
    expect(resolveAppLink('/app/gestao', 'https://app.exemplo.com/')).toBe('https://app.exemplo.com/app/gestao');
  });

  it('aceita link absoluto só do próprio app', () => {
    expect(resolveAppLink('https://oxyve.vercel.app/app/x', APP)).toBe('https://oxyve.vercel.app/app/x');
    expect(resolveAppLink('https://phishing.example/app', APP)).toBeNull();
    expect(resolveAppLink('//phishing.example/app', APP)).toBeNull();
    expect(resolveAppLink('javascript:alert(1)', APP)).toBeNull();
  });

  it('sem link devolve null', () => {
    expect(resolveAppLink(undefined, APP)).toBeNull();
    expect(resolveAppLink('', APP)).toBeNull();
    expect(resolveAppLink(null, APP)).toBeNull();
  });
});

describe('buildEmailContent', () => {
  it('anexa a URL ao texto e monta HTML com botão', () => {
    const out = buildEmailContent(
      { subject: 'Relatório aguardando aprovação', text: 'Ana enviou R$ 120,00', link: '/app/reports/r1' },
      APP,
    );
    expect(out.text).toContain('Ana enviou R$ 120,00');
    expect(out.text).toContain('https://oxyve.vercel.app/app/reports/r1');
    expect(out.html).toContain('href="https://oxyve.vercel.app/app/reports/r1"');
    expect(out.html).toContain('Abrir no Oxy VE');
  });

  it('escapa título e corpo no HTML', () => {
    const out = buildEmailContent(
      { subject: '<b>x</b>', text: 'Fornecedor "A & B" <script>' },
      APP,
    );
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).toContain('&quot;A &amp; B&quot;');
    expect(out.html).not.toContain('<b>x</b>');
  });

  it('sem link não põe botão', () => {
    const out = buildEmailContent({ subject: 'Oi', text: 'Corpo' }, APP);
    expect(out.html).not.toContain('href=');
    expect(out.text).toBe('Corpo');
  });

  it('mantém o html do chamador e acrescenta o link', () => {
    const out = buildEmailContent(
      { subject: 'Oi', html: '<p>Pronto</p>', link: '/app/dashboard' },
      APP,
    );
    expect(out.html).toContain('<p>Pronto</p>');
    expect(out.html).toContain('https://oxyve.vercel.app/app/dashboard');
    expect(out.text).toContain('https://oxyve.vercel.app/app/dashboard');
  });
});
