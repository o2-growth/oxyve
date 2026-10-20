import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, LoadError } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatCurrency } from '@/lib/constants';
import { useExpenseTypes } from '@/hooks/useExpenseTypes';
import {
  useContaAzulActions,
  useContaAzulConfig,
  useContaAzulMaps,
  useContaAzulOpcoes,
  useContaAzulReports,
  type CaOpcao,
  type CaStatus,
  type ContaAzulReportRow,
} from '@/hooks/useContaAzul';
import { AlertTriangle, Link2, Loader2, PlugZap, RefreshCw, Send, Unplug } from 'lucide-react';

const NENHUM = '';

// Muitas linhas de de-para: select nativo, leve e com a lista do sistema no celular.
const SELECT_CLS =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const KIND_LABELS: Record<string, string> = {
  food: 'Alimentação (tipo)',
  transport: 'Transporte (tipo)',
  other: 'Outros (tipo)',
};

const STATUS_LABEL: Record<CaStatus, string> = {
  pendente: 'Na fila',
  enviando: 'Enviando',
  enviado: 'Enviado',
  erro: 'Erro',
  pago_sync: 'Pago e sincronizado',
};

const STATUS_VARIANT: Record<CaStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pendente: 'outline',
  enviando: 'secondary',
  enviado: 'secondary',
  erro: 'destructive',
  pago_sync: 'default',
};

function formatIso(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function formatDataHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function rotulo(o: CaOpcao): string {
  return o.extra ? `${o.nome} (${o.extra})` : o.nome;
}

/** Select de opção do Conta Azul; mostra o nome salvo mesmo antes de a lista carregar. */
function OpcaoSelect({
  id,
  label,
  opcoes,
  valor,
  nomeSalvo,
  vazio,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  opcoes: CaOpcao[] | undefined;
  valor: string | null;
  nomeSalvo?: string | null;
  vazio: string;
  disabled?: boolean;
  onChange: (o: CaOpcao | null) => void;
}) {
  const lista = opcoes ?? [];
  const faltaNaLista = !!valor && !lista.some((o) => o.id === valor);
  return (
    <select
      id={id}
      aria-label={label}
      className={SELECT_CLS}
      value={valor ?? NENHUM}
      disabled={disabled}
      onChange={(e) => onChange(lista.find((o) => o.id === e.target.value) ?? null)}
    >
      <option value={NENHUM}>{vazio}</option>
      {faltaNaLista && <option value={valor as string}>{nomeSalvo || valor}</option>}
      {lista.map((o) => (
        <option key={o.id} value={o.id}>
          {rotulo(o)}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* Conexão e configuração                                              */
/* ------------------------------------------------------------------ */

function ConexaoCard() {
  const { data: cfg, isLoading, isError, refetch } = useContaAzulConfig();
  const conectado = !!cfg?.conectado && !cfg?.precisa_reconectar;
  const opcoes = useContaAzulOpcoes(conectado);
  const { conectar, desconectar, salvarConfig, sincronizar } = useContaAzulActions();
  const [confirmando, setConfirmando] = useState(false);

  const [conta, setConta] = useState<CaOpcao | null>(null);
  const [dia, setDia] = useState('25');
  const [ativo, setAtivo] = useState(false);
  useEffect(() => {
    if (!cfg) return;
    setConta(cfg.conta_financeira_id ? { id: cfg.conta_financeira_id, nome: cfg.conta_financeira_nome ?? cfg.conta_financeira_id } : null);
    setDia(String(cfg.dia_vencimento ?? 25));
    setAtivo(cfg.ativo);
  }, [cfg]);

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (isError || !cfg) return <LoadError onRetry={() => refetch()} />;

  const diaNum = Number(dia);
  const diaValido = Number.isInteger(diaNum) && diaNum >= 1 && diaNum <= 28;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg">Conexão com o Conta Azul</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Relatório aprovado vira uma conta a pagar no Conta Azul; o pagamento sincroniza nos dois sentidos.
            </CardDescription>
          </div>
          {conectado ? (
            <Badge variant="default" className="w-fit gap-1">
              <Link2 className="h-3 w-3" /> Conectado{cfg.empresa_nome ? ` · ${cfg.empresa_nome}` : ''}
            </Badge>
          ) : cfg.precisa_reconectar ? (
            <Badge variant="destructive" className="w-fit gap-1">
              <AlertTriangle className="h-3 w-3" /> Reconectar
            </Badge>
          ) : (
            <Badge variant="outline" className="w-fit">Não conectado</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {cfg.last_error && (
          <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive" role="alert">
            {cfg.last_error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!conectado ? (
            <Button onClick={() => conectar.mutate()} disabled={conectar.isPending} className="h-11 gap-2">
              {conectar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              {cfg.precisa_reconectar ? 'Reconectar Conta Azul' : 'Conectar Conta Azul'}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => sincronizar.mutate()}
                disabled={sincronizar.isPending || !cfg.ativo}
                title={!cfg.ativo ? 'Ative o envio para sincronizar' : undefined}
                className="h-11 gap-2"
              >
                {sincronizar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sincronizar agora
              </Button>
              <Button variant="outline" onClick={() => setConfirmando(true)} className="h-11 gap-2">
                <Unplug className="h-4 w-4" /> Desconectar
              </Button>
            </>
          )}
        </div>

        {(cfg.conectado || cfg.conta_financeira_id) && (
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <div className="space-y-1.5">
              <Label htmlFor="ca-conta" className="o2-eyebrow">Conta financeira (de onde sai o pagamento)</Label>
              <OpcaoSelect
                id="ca-conta"
                label="Conta financeira"
                opcoes={opcoes.data?.contas_financeiras}
                valor={conta?.id ?? null}
                nomeSalvo={cfg.conta_financeira_nome}
                vazio={opcoes.isLoading ? 'Carregando…' : 'Escolha a conta'}
                disabled={!conectado}
                onChange={setConta}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ca-dia" className="o2-eyebrow">Dia de vencimento</Label>
              <Input
                id="ca-dia"
                inputMode="numeric"
                className="h-11 o2-num"
                value={dia}
                onChange={(e) => setDia(e.target.value.replace(/\D/g, '').slice(0, 2))}
                aria-invalid={!diaValido}
              />
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch id="ca-ativo" checked={ativo} onCheckedChange={setAtivo} disabled={!conectado} />
              <Label htmlFor="ca-ativo" className="text-sm">
                Enviar relatórios aprovados ao Conta Azul
              </Label>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Vence no próximo dia {diaValido ? diaNum : '—'} a partir da aprovação (aprovado até o dia {diaValido ? diaNum : '—'}, vence no mesmo mês).
              {cfg.last_sync_at ? ` Última sincronização: ${formatDataHora(cfg.last_sync_at)}.` : ''}
            </p>
            {opcoes.isError && (
              <p className="text-sm text-destructive sm:col-span-2" role="alert">
                {(opcoes.error as Error).message}
              </p>
            )}
            <div className="sm:col-span-2">
              <Button
                className="h-11"
                disabled={!diaValido || salvarConfig.isPending}
                onClick={() =>
                  salvarConfig.mutate({
                    conta_financeira_id: conta?.id ?? null,
                    conta_financeira_nome: conta?.nome ?? null,
                    dia_vencimento: diaNum,
                    ativo,
                  })
                }
              >
                Salvar configuração
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="Desconectar o Conta Azul?"
        description="O envio para de funcionar até conectar de novo. O que já foi lançado no Conta Azul continua lá."
        confirmLabel="Desconectar"
        variant="destructive"
        isLoading={desconectar.isPending}
        onConfirm={() => desconectar.mutate(undefined, { onSettled: () => setConfirmando(false) })}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* De-para                                                             */
/* ------------------------------------------------------------------ */

function DeParaCard({ conectado }: { conectado: boolean }) {
  const { data: categorias, isLoading: carregandoCat } = useExpenseTypes();
  const { data: maps, isLoading: carregandoMaps, isError, refetch } = useContaAzulMaps();
  const opcoes = useContaAzulOpcoes(conectado);
  const { salvarCategoria, salvarSetor } = useContaAzulActions();

  const setores = useMemo(() => {
    const s = new Set<string>(['Geral']);
    for (const c of categorias ?? []) if (c.sector?.trim()) s.add(c.sector.trim());
    return [...s].sort((a, b) => (a === 'Geral' ? -1 : b === 'Geral' ? 1 : a.localeCompare(b, 'pt-BR')));
  }, [categorias]);

  if (carregandoCat || carregandoMaps) return <Skeleton className="h-64 w-full" />;
  if (isError || !maps) return <LoadError onRetry={() => refetch()} />;

  const mapCat = (id: string) => maps.categorias.find((m) => m.expense_category_id === id);
  const mapKind = (k: string) => maps.categorias.find((m) => m.kind === k);
  const mapSetor = (s: string) => maps.setores.find((m) => m.sector === s);
  const semLista = !conectado || opcoes.isError;
  // Sem a lista carregada, escolher apagaria o de-para salvo.
  const travado = semLista || !opcoes.data;
  const vazioCat = opcoes.isLoading ? 'Carregando…' : '— sem correspondente —';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base sm:text-lg">Correspondência (de-para)</CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Cada categoria do Oxy VE precisa de uma categoria de despesa do Conta Azul; sem ela, o relatório fica
          com erro e não é enviado. O tipo vale para as categorias sem correspondência própria. Setor sem centro
          de custo vai sem centro de custo.
        </CardDescription>
        {semLista && (
          <p className="text-sm text-muted-foreground">
            {conectado ? 'Não foi possível ler as listas do Conta Azul.' : 'Conecte o Conta Azul para escolher as correspondências.'}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider">Categoria no Oxy VE</TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider">Categoria no Conta Azul</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(categorias ?? []).map((c) => {
              const m = mapCat(c.id);
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    {c.name}
                    {!c.is_active && <span className="ml-2 text-xs text-muted-foreground">(inativa)</span>}
                  </TableCell>
                  <TableCell className="min-w-[200px]">
                    <OpcaoSelect
                      id={`ca-cat-${c.id}`}
                      label={`Categoria do Conta Azul para ${c.name}`}
                      opcoes={opcoes.data?.categorias}
                      valor={m?.ca_categoria_id ?? null}
                      nomeSalvo={m?.ca_categoria_nome}
                      vazio={vazioCat}
                      disabled={travado || salvarCategoria.isPending}
                      onChange={(ca) => salvarCategoria.mutate({ expense_category_id: c.id, kind: null, ca })}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {(['food', 'transport', 'other'] as const).map((k) => {
              const m = mapKind(k);
              return (
                <TableRow key={k}>
                  <TableCell className="text-muted-foreground">{KIND_LABELS[k]}</TableCell>
                  <TableCell className="min-w-[200px]">
                    <OpcaoSelect
                      id={`ca-kind-${k}`}
                      label={`Categoria do Conta Azul para ${KIND_LABELS[k]}`}
                      opcoes={opcoes.data?.categorias}
                      valor={m?.ca_categoria_id ?? null}
                      nomeSalvo={m?.ca_categoria_nome}
                      vazio={vazioCat}
                      disabled={travado || salvarCategoria.isPending}
                      onChange={(ca) => salvarCategoria.mutate({ expense_category_id: null, kind: k, ca })}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider">Setor</TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider">Centro de custo no Conta Azul</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {setores.map((s) => {
              const m = mapSetor(s);
              return (
                <TableRow key={s}>
                  <TableCell className="font-medium">{s}</TableCell>
                  <TableCell className="min-w-[200px]">
                    <OpcaoSelect
                      id={`ca-setor-${s}`}
                      label={`Centro de custo para ${s}`}
                      opcoes={opcoes.data?.centros_custo}
                      valor={m?.ca_centro_custo_id ?? null}
                      nomeSalvo={m?.ca_centro_custo_nome}
                      vazio={opcoes.isLoading ? 'Carregando…' : '— sem centro de custo —'}
                      disabled={travado || salvarSetor.isPending}
                      onChange={(ca) => salvarSetor.mutate({ sector: s, ca })}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Envios                                                              */
/* ------------------------------------------------------------------ */

function EnvioAcao({ r, ativo }: { r: ContaAzulReportRow; ativo: boolean }) {
  const { reenviar } = useContaAzulActions();
  if (r.ca_status && r.ca_status !== 'erro') return null;
  const rotuloBotao = r.ca_status === 'erro' ? 'Reenviar' : 'Enviar';
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-9 gap-1.5"
      disabled={!ativo || reenviar.isPending}
      title={!ativo ? 'Ative o envio na configuração' : undefined}
      onClick={() => reenviar.mutate(r.id)}
      aria-label={`${rotuloBotao} ${r.title} de ${r.full_name ?? 'colaborador'}`}
    >
      <Send className="h-3.5 w-3.5" /> {rotuloBotao}
    </Button>
  );
}

function EnviosCard({ ativo }: { ativo: boolean }) {
  const { data, isLoading, isError, refetch } = useContaAzulReports();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base sm:text-lg">Relatórios no Conta Azul</CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Aprovados e pagos, com a situação do envio. O envio roda a cada 5 minutos; a quitação feita no Conta Azul
          é conferida a cada 15.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <LoadError onRetry={() => refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="Nenhum relatório aprovado" description="Relatórios aprovados aparecem aqui com o status do envio." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-[11px] uppercase tracking-wider">Colaborador</TableHead>
                <TableHead className="font-mono text-[11px] uppercase tracking-wider">Relatório</TableHead>
                <TableHead className="text-right font-mono text-[11px] uppercase tracking-wider">Valor</TableHead>
                <TableHead className="font-mono text-[11px] uppercase tracking-wider">Envio</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.full_name || 'Sem nome'}</TableCell>
                  <TableCell>
                    <span>{r.title}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {r.status === 'paid' ? 'Pago no Oxy VE' : 'Aprovado'}
                      {r.ca_vencimento ? ` · vence ${formatIso(r.ca_vencimento)}` : ''}
                    </span>
                  </TableCell>
                  <TableCell className="text-right o2-num">{formatCurrency(r.total_cents)}</TableCell>
                  <TableCell className="max-w-[280px]">
                    {r.ca_status ? (
                      <Badge variant={STATUS_VARIANT[r.ca_status]}>{STATUS_LABEL[r.ca_status]}</Badge>
                    ) : (
                      <Badge variant="outline">Não enviado</Badge>
                    )}
                    {r.ca_error && <p className="mt-1 text-xs text-destructive">{r.ca_error}</p>}
                  </TableCell>
                  <TableCell className="text-right">
                    <EnvioAcao r={r} ativo={ativo} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function GestaoContaAzul() {
  const { data: cfg } = useContaAzulConfig();
  const conectado = !!cfg?.conectado && !cfg?.precisa_reconectar;
  return (
    <div className="space-y-6">
      <ConexaoCard />
      <DeParaCard conectado={conectado} />
      <EnviosCard ativo={!!cfg?.ativo && conectado} />
    </div>
  );
}
