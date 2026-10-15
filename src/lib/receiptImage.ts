/**
 * Reduz a foto do comprovante antes da leitura automática. Foto de celular
 * passa fácil de 4000px/6 MB: a função recusa acima de ~6 MB (413) e a OpenAI
 * não lê melhor acima de ~1600px. Só a cópia enviada para leitura é reduzida;
 * o arquivo anexado à despesa continua o original.
 */
export const OCR_MAX_SIDE = 1600;
export const OCR_JPEG_QUALITY = 0.8;
// Abaixo disso (e dentro de OCR_MAX_SIDE) vale mais mandar o original do que recomprimir.
const SMALL_FILE_BYTES = 1_500_000;

/** Novo tamanho mantendo a proporção, com o maior lado em `max` (nunca aumenta). */
export function fitWithin(width: number, height: number, max = OCR_MAX_SIDE): { width: number; height: number } {
  const side = Math.max(width, height);
  if (!side || side <= max) return { width, height };
  const k = max / side;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Tira o prefixo data:...;base64,
      resolve(String(reader.result).split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/**
 * Imagem pronta para a leitura: JPEG com no máximo OCR_MAX_SIDE px. Se o
 * navegador não conseguir desenhar (canvas indisponível, formato que o <img>
 * não abre), manda o original — a função recusa com 413 se for grande demais.
 */
export async function prepareImageForOcr(file: File): Promise<{ base64: string; mimeType: string }> {
  const original = async () => ({ base64: await blobToBase64(file), mimeType: file.type });
  try {
    if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return original();
    const img = await loadImage(file);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (Math.max(w, h) <= OCR_MAX_SIDE && file.size <= SMALL_FILE_BYTES) return original();

    const size = fitWithin(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original();
    // Fundo branco: PNG transparente vira preto no JPEG.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(img, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', OCR_JPEG_QUALITY));
    if (!blob) return original();
    return { base64: await blobToBase64(blob), mimeType: 'image/jpeg' };
  } catch {
    return original();
  }
}
