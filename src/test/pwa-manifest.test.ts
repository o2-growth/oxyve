import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Sprint 4 — garantir que public/manifest.json continua válido após edits.
// Lovable e Sprint 5 podem mexer aqui; o teste falha cedo se quebrar.

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

interface Manifest {
  name?: string;
  short_name?: string;
  start_url?: string;
  display?: string;
  icons?: ManifestIcon[];
}

describe("public/manifest.json", () => {
  const manifestPath = resolve(__dirname, "..", "..", "public", "manifest.json");
  const raw = readFileSync(manifestPath, "utf-8");

  it("é JSON válido", () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  const manifest = JSON.parse(raw) as Manifest;

  it("tem campos obrigatórios (name, short_name, start_url, display)", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBe("standalone");
  });

  it("tem array de icons com src/sizes/type em cada entry", () => {
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons!.length).toBeGreaterThan(0);
    for (const icon of manifest.icons!) {
      expect(icon.src).toMatch(/^\//);
      expect(icon.sizes).toMatch(/^\d+x\d+$/);
      expect(icon.type).toMatch(/^image\//);
    }
  });

  it("tem ícones 192x192 e 512x512 (requeridos para installable PWA)", () => {
    const sizes = manifest.icons!.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("tem pelo menos um ícone maskable", () => {
    const hasMaskable = manifest.icons!.some((i) => i.purpose?.includes("maskable"));
    expect(hasMaskable).toBe(true);
  });
});
