import { describe, it, expect } from 'vitest';
import { groupBySector, SECTOR_FALLBACK } from './categoryGroups';

const cat = (name: string, kind: string, sector: string | null) => ({ name, kind, sector });

describe('groupBySector', () => {
  it('agrupa por setor em ordem alfabética, com Geral por último', () => {
    const groups = groupBySector([
      cat('Outros', 'other', null),
      cat('Alimentação – Comercial', 'food', 'Comercial'),
      cat('Deslocamento – Administrativo', 'transport', 'Administrativo'),
      cat('Alimentação – Administrativo', 'food', 'Administrativo'),
    ]);
    expect(groups.map((g) => g.sector)).toEqual(['Administrativo', 'Comercial', SECTOR_FALLBACK]);
  });

  it('dentro do setor, alimentação vem antes de transporte e de outros', () => {
    const [admin] = groupBySector([
      cat('Hospedagem – Administrativo', 'other', 'Administrativo'),
      cat('Deslocamento – Administrativo', 'transport', 'Administrativo'),
      cat('Alimentação – Administrativo', 'food', 'Administrativo'),
    ]);
    expect(admin.items.map((c) => c.kind)).toEqual(['food', 'transport', 'other']);
  });

  it('setor vazio ou só com espaços cai em Geral', () => {
    const groups = groupBySector([cat('Transporte', 'transport', '  '), cat('Outros', 'other', null)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sector).toBe(SECTOR_FALLBACK);
  });

  it('não altera a lista recebida', () => {
    const input = [cat('B', 'other', 'X'), cat('A', 'food', 'X')];
    groupBySector(input);
    expect(input.map((c) => c.name)).toEqual(['B', 'A']);
  });
});
