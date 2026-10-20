import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Regra do projeto: migration só pode ser aditiva. Dados de produção não se
// apagam nem se reescrevem por migration. Corpo de função (o que roda em
// runtime, dentro de $...$) fica de fora da checagem; o que conta é o que a
// migration executa ao ser aplicada.
//
// Vale a partir da blindagem (20261015); as antigas são histórico.
const DESDE = "20261015000000";

const dir = resolve(__dirname, "..", "..", "supabase", "migrations");

/** Remove comentários e blocos dollar-quoted, e quebra em comandos. */
export function comandosDeTopo(sql: string): string[] {
  let s = sql.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''");
  s = s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return s
    .split(";")
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const PROIBIDO = [
  /^DELETE\b/i,
  /^UPDATE\b/i,
  /^TRUNCATE\b/i,
  /^DROP\b/i,
  /^ALTER TABLE\b.*\bDROP\b/i,
  /^ALTER TABLE\b.*\bALTER COLUMN\b.*\bTYPE\b/i,
  /^INSERT\b(?!.*\bON CONFLICT\b.*\bDO NOTHING\b)/i,
];

describe("comandosDeTopo", () => {
  it("ignora corpo de função e comentários", () => {
    const sql = `-- DELETE FROM x;
CREATE FUNCTION f() RETURNS void AS $function$ BEGIN DELETE FROM t; END $function$;
DO $$ BEGIN UPDATE t SET a = 1; END $$;
UPDATE t SET a = 2;`;
    expect(comandosDeTopo(sql)).toEqual([
      "CREATE FUNCTION f() RETURNS void AS ''",
      "DO ''",
      "UPDATE t SET a = 2",
    ]);
  });
});

describe("migrations novas são só aditivas", () => {
  const arquivos = readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && f.slice(0, 14) >= DESDE)
    .sort();

  it("há migrations no recorte", () => {
    expect(arquivos.length).toBeGreaterThan(0);
  });

  for (const arquivo of arquivos) {
    it(`${arquivo} não apaga nem reescreve dados`, () => {
      const cmds = comandosDeTopo(readFileSync(resolve(dir, arquivo), "utf-8"));
      const violacoes = cmds.filter((c) => PROIBIDO.some((re) => re.test(c)));
      expect(violacoes).toEqual([]);
    });
  }
});
