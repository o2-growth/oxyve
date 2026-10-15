/**
 * Redução da foto antes da leitura automática: maior lado em 1600px mantendo a
 * proporção; sem canvas/URL (jsdom, navegador antigo) manda o original.
 */
import { describe, it, expect, vi } from 'vitest';
import { fitWithin, prepareImageForOcr, OCR_MAX_SIDE } from '@/lib/receiptImage';

describe('fitWithin', () => {
  it('reduz pelo maior lado e mantém a proporção', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it('nunca aumenta imagem pequena', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(OCR_MAX_SIDE, 10)).toEqual({ width: OCR_MAX_SIDE, height: 10 });
  });

  it('não zera lado muito fino', () => {
    expect(fitWithin(16000, 1).height).toBe(1);
  });
});

describe('prepareImageForOcr', () => {
  it('sem URL.createObjectURL envia o original', async () => {
    const original = URL.createObjectURL;
    // jsdom não implementa; garante o cenário mesmo se um setup definir.
    (URL as unknown as { createObjectURL?: unknown }).createObjectURL = undefined;
    const file = new File(['abc'], 'nota.png', { type: 'image/png' });
    const res = await prepareImageForOcr(file);
    expect(res).toEqual({ base64: 'YWJj', mimeType: 'image/png' });
    (URL as unknown as { createObjectURL?: unknown }).createObjectURL = original;
  });

  it('se a imagem não abrir, envia o original', async () => {
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const RealImage = globalThis.Image;
    class BrokenImage {
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      set src(_v: string) {
        setTimeout(() => this.onerror?.(new Error('decode')), 0);
      }
    }
    vi.stubGlobal('Image', BrokenImage);
    const file = new File(['abc'], 'nota.jpg', { type: 'image/jpeg' });
    const res = await prepareImageForOcr(file);
    expect(res).toEqual({ base64: 'YWJj', mimeType: 'image/jpeg' });
    expect(revoke).toHaveBeenCalledWith('blob:x');
    vi.stubGlobal('Image', RealImage);
  });
});
