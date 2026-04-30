/**
 * Aria-3: heic2any é gigante (~1MB com WASM/libheif). Como só rodamos quando
 * o usuário sobe HEIC/HEIF (iPhone), importamos dinamicamente sob demanda
 * em vez de incluir no chunk inicial.
 */
function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === 'image/heic' || type === 'image/heif') return true;
  const name = file.name.toLowerCase();
  return name.endsWith('.heic') || name.endsWith('.heif');
}

export async function convertHeicToJpeg(file: File): Promise<File> {
  if (!isHeic(file)) return file;

  // Dynamic import — chunk separado, só carregado quando user envia HEIC.
  const { default: heic2any } = await import('heic2any');

  const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  const resultBlob = Array.isArray(blob) ? blob[0] : blob;
  const newName = file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
  return new File([resultBlob], newName, { type: 'image/jpeg' });
}
