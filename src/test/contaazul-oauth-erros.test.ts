/**
 * Conta Azul — OAuth, tradução de erros, leitura de respostas e limitador.
 */
import { describe, it, expect } from 'vitest';
import {
  basicAuth,
  buildAuthorizeUrl,
  buildTokenRequest,
  gerarState,
  parseTokenResponse,
  precisaRenovar,
  urlRetorno,
} from '../../supabase/functions/_shared/contaazul/oauth.ts';
import {
  detalheDoCorpo,
  traduzirErro,
  traduzirErroToken,
} from '../../supabase/functions/_shared/contaazul/errors.ts';
import {
  parseCategorias,
  parseContaCriada,
  parseListaContas,
  parseListaPessoas,
  parseParcela,
  parcelaQuitada,
} from '../../supabase/functions/_shared/contaazul/parse.ts';
import { criarLimitador } from '../../supabase/functions/_shared/contaazul/ratelimit.ts';
import { montarUrl } from '../../supabase/functions/_shared/contaazul/api.ts';

const cred = { clientId: 'cli id', clientSecret: 's3cr3t', redirectUri: 'https://x.supabase.co/functions/v1/contaazul-oauth' };

describe('OAuth', () => {
  it('authorize no fragmento #, com escopo fixo e parâmetros escapados', () => {
    const url = buildAuthorizeUrl(cred, 'abc');
    expect(url).toBe(
      'https://login.contaazul.com/#/oauth/authorize?response_type=code&client_id=cli%20id' +
        '&redirect_uri=https%3A%2F%2Fx.supabase.co%2Ffunctions%2Fv1%2Fcontaazul-oauth&state=abc' +
        '&scope=openid+profile+aws.cognito.signin.user.admin',
    );
  });

  it('troca do code: Basic base64(id:secret), form-urlencoded com redirect_uri', () => {
    const { url, init } = buildTokenRequest(cred, { grant: 'authorization_code', code: 'C0D3' });
    expect(url).toBe('https://api-v2.contaazul.com/oauth/token');
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe(`Basic ${Buffer.from('cli id:s3cr3t').toString('base64')}`);
    expect(h['Content-Type']).toBe('application/x-www-form-urlencoded');
    const form = new URLSearchParams(init.body as string);
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('C0D3');
    expect(form.get('redirect_uri')).toBe(cred.redirectUri);
  });

  it('renovação manda só grant_type e refresh_token', () => {
    const { init } = buildTokenRequest(cred, { grant: 'refresh_token', refreshToken: 'R1' });
    const form = new URLSearchParams(init.body as string);
    expect([...form.keys()]).toEqual(['grant_type', 'refresh_token']);
    expect(form.get('refresh_token')).toBe('R1');
  });

  it('basicAuth aguenta acento (UTF-8)', () => {
    expect(basicAuth('ç', 'ã')).toBe(`Basic ${Buffer.from('ç:ã', 'utf-8').toString('base64')}`);
  });

  it('resposta do token: guarda o refresh novo e calcula a expiração', () => {
    const agora = new Date('2026-10-20T12:00:00Z');
    expect(parseTokenResponse({ access_token: 'A', refresh_token: 'R2', expires_in: 3600 }, agora)).toEqual({
      accessToken: 'A',
      refreshToken: 'R2',
      expiresAt: '2026-10-20T13:00:00.000Z',
    });
    expect(parseTokenResponse({ access_token: 'A' }, agora)).toBeNull();
  });

  it('renova com 2 min de folga ou sem expiração', () => {
    const agora = new Date('2026-10-20T12:00:00Z');
    expect(precisaRenovar('2026-10-20T12:01:00Z', agora)).toBe(true);
    expect(precisaRenovar('2026-10-20T12:30:00Z', agora)).toBe(false);
    expect(precisaRenovar(null, agora)).toBe(true);
  });

  it('state aleatório de 64 hex e URL de retorno do app', () => {
    const a = gerarState();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(gerarState()).not.toBe(a);
    expect(urlRetorno('https://oxyve.vercel.app/', 'conectado')).toBe('https://oxyve.vercel.app/app/gestao?ca=conectado');
    expect(urlRetorno('https://oxyve.vercel.app', 'erro', 'state')).toBe('https://oxyve.vercel.app/app/gestao?ca=erro&motivo=state');
  });
});

describe('erros em pt-BR', () => {
  it('400 traz o detalhe do Conta Azul', () => {
    const t = traduzirErro(400, { error: 'id_fornecedor inválido' }, 'criar a conta a pagar');
    expect(t).toEqual({
      mensagem: 'Conta Azul recusou ao criar a conta a pagar: id_fornecedor inválido',
      transitorio: false,
      reconectar: false,
    });
  });
  it('lista de erros por campo', () => {
    expect(detalheDoCorpo({ errors: [{ field: 'valor', message: 'deve ser maior que zero' }, 'outro'] })).toBe(
      'valor: deve ser maior que zero; outro',
    );
  });
  it('401 pede reconexão; 429, 5xx e rede são transitórios', () => {
    expect(traduzirErro(401, null, 'x').reconectar).toBe(true);
    expect(traduzirErro(429, null, 'x').transitorio).toBe(true);
    expect(traduzirErro(502, null, 'x')).toMatchObject({ transitorio: true, mensagem: expect.stringContaining('erro 502') });
    expect(traduzirErro(null, null, 'lançar a baixa').mensagem).toBe(
      'Sem resposta do Conta Azul ao lançar a baixa. Nova tentativa automática no próximo ciclo.',
    );
  });
  it('invalid_grant na renovação = reconectar, com o motivo', () => {
    const t = traduzirErroToken(400, { error: 'invalid_grant', error_subtype: 'access_revoked', error_description: '...' });
    expect(t.reconectar).toBe(true);
    expect(t.mensagem).toBe('O acesso foi revogado no Conta Azul. Reconecte na aba Conta Azul da Gestão.');
    expect(traduzirErroToken(400, { error: 'invalid_client' }).mensagem).toContain('CONTAAZUL_CLIENT_ID');
    expect(traduzirErroToken(503, null).transitorio).toBe(true);
  });
});

describe('leitura das respostas', () => {
  it('conta criada: id do evento e da parcela', () => {
    expect(
      parseContaCriada({ id: 'ev1', condicao_pagamento: { parcelas: [{ id: 'p1', evento: { id: 'ev1' } }] } }),
    ).toEqual({ contaId: 'ev1', parcelaId: 'p1' });
    expect(parseContaCriada({})).toEqual({ contaId: null, parcelaId: null });
  });
  it('parcela: status, evento e valores em centavos', () => {
    const p = parseParcela({ id: 'p1', status: 'QUITADO', evento: { id: 'ev1' }, nao_pago: 0, valor_pago: 123.45, valor_total_liquido: 123.45 });
    expect(p).toEqual({ id: 'p1', status: 'QUITADO', eventoId: 'ev1', naoPagoCents: 0, totalCents: 12345, pagoCents: 12345 });
    expect(parcelaQuitada('QUITADO')).toBe(true);
    expect(parcelaQuitada('RECEBIDO')).toBe(true);
    expect(parcelaQuitada('PENDENTE')).toBe(false);
  });
  it('lista de contas a pagar (id = parcela) e de pessoas (items)', () => {
    expect(parseListaContas({ itens: [{ id: 'p1', descricao: ' Reembolso ', total: 10.1, status: 'EM_ABERTO' }, { descricao: 'sem id' }] }))
      .toEqual([{ parcelaId: 'p1', descricao: 'Reembolso', totalCents: 1010, dataVencimento: null, status: 'EM_ABERTO' }]);
    expect(parseListaPessoas({ items: [{ id: 'x', documento: '123.456.789-09', perfis: ['Fornecedor'] }] })).toEqual([
      { id: 'x', documento: '12345678909', ativo: true, perfis: ['Fornecedor'] },
    ]);
  });
  it('categorias: só despesa, com o nome da categoria pai', () => {
    expect(
      parseCategorias([
        { id: 'a', nome: 'Viagens', tipo: 'DESPESA' },
        { id: 'b', nome: 'Alimentação', tipo: 'DESPESA', categoria_pai: 'a' },
        { id: 'c', nome: 'Vendas', tipo: 'RECEITA' },
      ]),
    ).toEqual([
      { id: 'b', nome: 'Alimentação', extra: 'Viagens' },
      { id: 'a', nome: 'Viagens', extra: null },
    ]);
  });
  it('query: arrays por vírgula, vazios fora', () => {
    expect(montarUrl('https://h', '/v1/x', { status: ['A', 'B'], vazio: '', nulo: null, n: 2 })).toBe('https://h/v1/x?status=A%2CB&n=2');
  });
});

describe('limitador de 10 req/s', () => {
  it('espaça chamadas seguidas em 110 ms', async () => {
    let t = 1000;
    const esperas: number[] = [];
    const lim = criarLimitador(110, { now: () => t, sleep: async (ms) => { esperas.push(ms); } });
    await Promise.all([lim(), lim(), lim()]);
    expect(esperas).toEqual([110, 220]);
    t = 5000;
    await lim();
    expect(esperas).toEqual([110, 220]);
  });
});
