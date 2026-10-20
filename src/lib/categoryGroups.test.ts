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
  it('setor Tech entra em ordem alfabética, antes de Geral', () => {
    const groups = groupBySector([
      cat('Software e Tecnologia', 'other', null),
      cat('Alimentação – Tech', 'food', 'Tech'),
      cat('Alimentação – Tax', 'food', 'Tax'),
      cat('Alimentação – SaaS', 'food', 'SaaS'),
    ]);
    expect(groups.map((g) => g.sector)).toEqual(['SaaS', 'Tax', 'Tech', SECTOR_FALLBACK]);
  });

  it('Viagens e Estadias fica no grupo do setor, depois de Alimentação e Deslocamento', () => {
    const groups = groupBySector([
      cat('Viagens e Estadias – Tech', 'other', 'Tech'),
      cat('Eventos Internos', 'other', null),
      cat('Deslocamento – Tech', 'transport', 'Tech'),
      cat('Alimentação – Tech', 'food', 'Tech'),
      cat('Viagens e Estadias – Comercial', 'other', 'Comercial'),
    ]);
    const tech = groups.find((g) => g.sector === 'Tech')!;
    expect(tech.items.map((c) => c.name)).toEqual([
      'Alimentação – Tech',
      'Deslocamento – Tech',
      'Viagens e Estadias – Tech',
    ]);
    expect(groups.find((g) => g.sector === 'Comercial')!.items.map((c) => c.name)).toEqual([
      'Viagens e Estadias – Comercial',
    ]);
    expect(groups.find((g) => g.sector === SECTOR_FALLBACK)!.items.map((c) => c.name)).toEqual([
      'Eventos Internos',
    ]);
  });

  it('categorias gerais sem setor ficam em Geral, em ordem alfabética', () => {
    const groups = groupBySector([
      cat('Software e Tecnologia', 'other', null),
      cat('Eventos Comerciais', 'other', null),
      cat('Materiais de Uso e Consumo', 'other', null),
      cat('Eventos Internos', 'other', null),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((c) => c.name)).toEqual([
      'Eventos Comerciais',
      'Eventos Internos',
      'Materiais de Uso e Consumo',
      'Software e Tecnologia',
    ]);
  });
});
