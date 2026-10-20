// Datas da integração com o Conta Azul. Módulo puro (sem Deno) para o Vitest.
//
// Tudo em "YYYY-MM-DD" no fuso de São Paulo: a aprovação às 23h de dia 25 em
// Brasília ainda é dia 25, mesmo que em UTC já seja 26.

export const DIA_VENCIMENTO_PADRAO = 25;

const FMT_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Data (YYYY-MM-DD) de um instante no fuso de São Paulo. */
export function dataSaoPaulo(instante: Date | string): string {
  const d = typeof instante === "string" ? new Date(instante) : instante;
  if (Number.isNaN(d.getTime())) throw new Error("Data inválida");
  return FMT_SP.format(d);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Dia de vencimento aceito: 1 a 28 (todo mês tem). Fora disso, o padrão. */
export function normalizarDia(dia: number | null | undefined): number {
  return Number.isInteger(dia) && (dia as number) >= 1 && (dia as number) <= 28
    ? (dia as number)
    : DIA_VENCIMENTO_PADRAO;
}

/**
 * Próximo dia `dia` a partir da aprovação: aprovado até o dia (inclusive) vence
 * no mesmo mês; depois dele, no mês seguinte (dezembro vira janeiro do ano
 * seguinte).
 */
export function calcularVencimento(dataAprovacao: string, dia: number = DIA_VENCIMENTO_PADRAO): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataAprovacao);
  if (!m) throw new Error(`Data de aprovação inválida: ${dataAprovacao}`);
  const d = normalizarDia(dia);
  let ano = Number(m[1]);
  let mes = Number(m[2]);
  const diaAprov = Number(m[3]);
  if (diaAprov > d) {
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return `${ano}-${pad(mes)}-${pad(d)}`;
}

/** Soma dias a uma data YYYY-MM-DD (aritmética em UTC, sem fuso no meio). */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
