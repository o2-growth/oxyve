// Agrupa as categorias de despesa por setor para os seletores.
//
// As categorias da O2 seguem o padrão do VExpenses, "Tipo – Setor"
// (Alimentação – Comercial, Deslocamento – Administrativo…). Listadas em
// ordem alfabética pura, as dezenas de categorias viram uma lista longa em que
// o colaborador procura o próprio setor; agrupando por setor ele abre direto
// no grupo dele. Categoria sem setor cai em "Geral", sempre por último.

export const SECTOR_FALLBACK = 'Geral';

const KIND_ORDER: Record<string, number> = { food: 0, transport: 1, other: 2 };

interface Groupable {
  name: string;
  kind?: string | null;
  sector?: string | null;
}

export interface CategoryGroup<T> {
  sector: string;
  items: T[];
}

export function groupBySector<T extends Groupable>(types: readonly T[]): CategoryGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const t of types) {
    const sector = t.sector?.trim() || SECTOR_FALLBACK;
    if (!groups.has(sector)) groups.set(sector, []);
    groups.get(sector)!.push(t);
  }

  const byKindThenName = (a: T, b: T) =>
    (KIND_ORDER[a.kind ?? 'other'] ?? 2) - (KIND_ORDER[b.kind ?? 'other'] ?? 2) ||
    a.name.localeCompare(b.name, 'pt-BR');

  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === SECTOR_FALLBACK) return 1;
      if (b === SECTOR_FALLBACK) return -1;
      return a.localeCompare(b, 'pt-BR');
    })
    .map(([sector, items]) => ({ sector, items: [...items].sort(byKindThenName) }));
}
