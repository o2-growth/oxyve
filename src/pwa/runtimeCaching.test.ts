import { describe, it, expect } from 'vitest';
import { runtimeCaching, IMAGES_CACHE } from './runtimeCaching';

type Matcher = (ctx: { request: Request; url: URL }) => boolean;

function req(destination: string): Request {
  return { destination } as unknown as Request;
}

function matchingRules(url: string, destination = '') {
  return runtimeCaching.filter((r) =>
    (r.urlPattern as Matcher)({ request: req(destination), url: new URL(url) }),
  );
}

describe('runtimeCaching do service worker', () => {
  it('não guarda nada do PostgREST nem das edge functions', () => {
    expect(matchingRules('https://abc.supabase.co/rest/v1/expenses?select=*')).toHaveLength(0);
    expect(matchingRules('https://abc.supabase.co/functions/v1/validate-receipt')).toHaveLength(0);
    expect(matchingRules(`${self.location.origin}/rest/v1/expenses`)).toHaveLength(0);
    expect(runtimeCaching.map((r) => r.options.cacheName)).not.toContain('supabase-rest');
    expect(runtimeCaching.map((r) => r.options.cacheName)).not.toContain('supabase-functions');
  });

  it('não guarda comprovante do Storage nem foto do Google', () => {
    expect(
      matchingRules('https://abc.supabase.co/storage/v1/object/sign/receipts/a.jpg?token=x', 'image'),
    ).toHaveLength(0);
    expect(matchingRules('https://lh3.googleusercontent.com/a/foto', 'image')).toHaveLength(0);
  });

  it('guarda imagens da própria origem só com status 200', () => {
    const rules = matchingRules(`${self.location.origin}/icon-192.png`, 'image');
    expect(rules).toHaveLength(1);
    expect(rules[0].options.cacheName).toBe(IMAGES_CACHE);
    expect(rules[0].options.cacheableResponse.statuses).toEqual([200]);
  });

  it('as funções de urlPattern são autocontidas (o Workbox serializa com toString)', () => {
    for (const rule of runtimeCaching) {
      // Recria a função a partir do texto, como o sw.js gerado faz.
      const recreated = new Function(`return (${rule.urlPattern.toString()})`)() as Matcher;
      expect(typeof recreated).toBe('function');
      expect(() =>
        recreated({ request: req('image'), url: new URL(`${self.location.origin}/x.png`) }),
      ).not.toThrow();
    }
  });
});
