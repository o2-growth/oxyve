import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Decisões de negócio da rodada 4 (migration 20261015130000). O comportamento é
// provado em supabase/tests/decisoes.sql, que precisa de Postgres; aqui a checagem
// é estática e roda no CI: a versão VIGENTE de cada função (a última
// CREATE OR REPLACE por timestamp) tem de manter a regra. Pega uma migration
// futura que copie um corpo antigo e desfaça a decisão sem perceber.

const dir = resolve(__dirname, "..", "..", "supabase", "migrations");
const arquivos = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

/** Corpo ($function$...$function$) da última definição de public.<nome>. */
function vigente(nome: string): { arquivo: string; corpo: string } {
  const re = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${nome}\\s*\\([\\s\\S]*?AS\\s+\\$(\\w*)\\$([\\s\\S]*?)\\$\\1\\$`,
    "gi",
  );
  let achado: { arquivo: string; corpo: string } | null = null;
  for (const arquivo of arquivos) {
    const sql = readFileSync(resolve(dir, arquivo), "utf-8");
    for (const m of sql.matchAll(re)) achado = { arquivo, corpo: m[2] };
  }
  if (!achado) throw new Error(`função ${nome} não encontrada`);
  return achado;
}

describe("decisões da rodada 4 na versão vigente das funções", () => {
  it("decisão 1: mark_expenses_paid exige admin, como mark_report_paid", () => {
    const { corpo } = vigente("mark_expenses_paid");
    expect(corpo).toMatch(/has_role\(_uid,\s*'admin'\)/);
    expect(corpo).not.toMatch(/is_manager_or_admin/);
    // A mensagem precisa seguir reconhecida por lib/permissionError.ts.
    expect(corpo).toMatch(/Acesso restrito/);
    expect(vigente("mark_report_paid").corpo).toMatch(/has_role\(_user_id,\s*'admin'\)/);
  });

  it("decisão 2: admin_decide_report só aprova com todos os itens revisados e aprovados", () => {
    const { corpo } = vigente("admin_decide_report");
    expect(corpo).toMatch(/Revise todos os itens antes de aprovar/);
    expect(corpo).toMatch(/use Reprovar e devolver/);
    expect(corpo).toMatch(/Relatório sem despesas não pode ser aprovado/);
    expect(corpo).toMatch(/LEFT JOIN public\.expense_reviews/);
  });

  it("decisão 3: data+valor+categoria marca possible_duplicate_of; comprovante repetido bloqueia", () => {
    const { corpo } = vigente("tg_expenses_regras");
    expect(corpo).not.toMatch(/Lançamento duplicado bloqueado/);
    expect(corpo).toMatch(/INTO NEW\.possible_duplicate_of/);
    expect(corpo).toMatch(/Este comprovante já foi lançado em outra despesa/);
    // O cliente não apaga o alerta por PATCH.
    expect(vigente("tg_expenses_guard_client").corpo).toMatch(
      /NEW\.possible_duplicate_of := OLD\.possible_duplicate_of/,
    );
  });

  it("decisão 3: as RPCs de lançamento devolvem o aviso de duplicidade", () => {
    const unica = vigente("create_expense_in_current_report").corpo;
    expect(unica).toMatch(/'possible_duplicate', _expense\.possible_duplicate_of IS NOT NULL/);
    expect(unica).toMatch(/'possible_duplicate_of', _expense\.possible_duplicate_of/);
    // Chaves que o front já lê continuam lá.
    for (const chave of ["expense", "report", "late", "late_report", "is_out_of_policy"]) {
      expect(unica).toContain(`'${chave}'`);
    }
    expect(vigente("create_expense_multiday").corpo).toMatch(/'possible_duplicates', _dups/);
  });

  it("decisão 3: a coluna existe na migration e nos types do front", () => {
    const sql = readFileSync(resolve(dir, "20261015130000_decisoes_rodada4.sql"), "utf-8");
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS possible_duplicate_of uuid NULL\s+REFERENCES public\.expenses\(id\) ON DELETE SET NULL/,
    );
    const types = readFileSync(resolve(__dirname, "..", "integrations", "supabase", "types.ts"), "utf-8");
    expect(types).toContain("possible_duplicate_of: string | null");
    expect(types).toContain('foreignKeyName: "expenses_possible_duplicate_of_fkey"');
  });

  it("decisão 4: o painel traz PIX e dados bancários de quem recebe", () => {
    const { corpo } = vigente("get_admin_financial_overview");
    expect(corpo).toMatch(/p\.pix_key, p\.pix_key_type, p\.bank_name, p\.bank_branch, p\.bank_account/);
    // Não reembolsável continua valendo 0 nos totais.
    expect(corpo).toMatch(/CASE WHEN e\.is_reimbursable THEN COALESCE\(e\.reimbursable_cents, e\.amount_cents\) ELSE 0 END AS reemb/);
  });
});
