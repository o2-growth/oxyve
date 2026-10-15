import { describe, it, expect, vi, afterEach } from 'vitest';
import { clearRuntimeCaches } from './pwaCache';

afterEach(() => {
  // @ts-expect-error — limpando o stub de teste.
  delete window.caches;
});

describe('clearRuntimeCaches', () => {
  it('apaga os caches de runtime e preserva o precache do app', async () => {
    const del = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue([
          'workbox-precache-v2-http://localhost/',
          'supabase-rest',
          'supabase-functions',
          'images',
          'images-v2',
          'fonts',
        ]),
        delete: del,
      },
    });

    await clearRuntimeCaches();

    const apagados = del.mock.calls.map((c) => c[0]);
    expect(apagados).toEqual(['supabase-rest', 'supabase-functions', 'images', 'images-v2', 'fonts']);
  });

  it('não lança se o Cache Storage falhar', async () => {
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { keys: vi.fn().mockRejectedValue(new Error('SecurityError')), delete: vi.fn() },
    });
    await expect(clearRuntimeCaches()).resolves.toBeUndefined();
  });

  it('não faz nada sem Cache Storage', async () => {
    await expect(clearRuntimeCaches()).resolves.toBeUndefined();
  });
});
