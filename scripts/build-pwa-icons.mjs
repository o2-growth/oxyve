// Sprint 4 — gera ícones PWA programaticamente com sharp.
// Tema: bloco azul primary (#3b82f6) com "O2" branco bold em Arial.
// - icon-192.png         → 192x192, conteúdo até as bordas (purpose: any)
// - icon-512.png         → 512x512, conteúdo até as bordas (purpose: any)
// - icon-maskable-512.png → 512x512, conteúdo dentro de safe area 80% (purpose: maskable)
// - apple-touch-icon.png → 180x180
//
// Rodar com: bun run scripts/build-pwa-icons.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

await mkdir(PUBLIC_DIR, { recursive: true });

function svgIcon({ size, radius, fontSize, textY, padding = 0 }) {
  const inner = size - padding * 2;
  // Quando padding > 0 (maskable), o quadrado azul ocupa só a safe area;
  // o restante fica preenchido com a mesma cor (bg full bleed) pra não dar gap.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#3b82f6"/>
  <rect x="${padding}" y="${padding}" width="${inner}" height="${inner}" fill="#3b82f6" rx="${radius}"/>
  <text x="${size / 2}" y="${textY}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="900" fill="white" text-anchor="middle">O2</text>
</svg>`;
}

const targets = [
  {
    file: "icon-192.png",
    svg: svgIcon({ size: 192, radius: 32, fontSize: 110, textY: 130 }),
  },
  {
    file: "icon-512.png",
    svg: svgIcon({ size: 512, radius: 80, fontSize: 280, textY: 340 }),
  },
  {
    // Maskable: conteúdo principal dentro de 80% central (safe zone),
    // mas o fundo cobre tudo (full bleed) — a borda externa pode ser cortada.
    file: "icon-maskable-512.png",
    svg: svgIcon({ size: 512, radius: 0, fontSize: 220, textY: 320, padding: 51 }),
  },
  {
    file: "apple-touch-icon.png",
    svg: svgIcon({ size: 180, radius: 30, fontSize: 105, textY: 122 }),
  },
];

for (const { file, svg } of targets) {
  const out = path.join(PUBLIC_DIR, file);
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log(`wrote ${out}`);
}
