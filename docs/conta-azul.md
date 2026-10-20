# Integração com o Conta Azul

Relatório **aprovado** no Oxy VE vira **uma conta a pagar** no Conta Azul, no
nome do funcionário (pessoa física, perfil Fornecedor). O pagamento sincroniza
nos dois sentidos:

- pago no Oxy VE → o sync lança a **baixa** (PIX) na parcela do Conta Azul;
- quitado no Conta Azul → o sync marca o relatório como **pago** no Oxy VE
  (mesmo efeito do "Marcar como pago"; o histórico registra `origem: conta_azul`).

A API do Conta Azul não tem webhook: tudo é por polling. O cron chama a edge
`contaazul-sync` a cada 5 min (só quando há o que fazer); a quitação lá é
conferida a cada 15 min.

## 1. Criar o app no Portal do Desenvolvedor

1. Entre em <https://developers.contaazul.com> e crie uma aplicação de **produção**
   (a de desenvolvimento só aceita `https://www.contaazul.com` como retorno).
2. URL de redirecionamento (tem de ser exatamente esta):

   ```
   https://mxouphopjfoxtfxpfnde.supabase.co/functions/v1/contaazul-oauth
   ```

3. Anote o `client_id` e o `client_secret`.

## 2. Secrets no Supabase

```bash
supabase secrets set --project-ref mxouphopjfoxtfxpfnde \
  CONTAAZUL_CLIENT_ID='...' \
  CONTAAZUL_CLIENT_SECRET='...' \
  CONTAAZUL_REDIRECT_URI='https://mxouphopjfoxtfxpfnde.supabase.co/functions/v1/contaazul-oauth'
# Opcional (padrão https://oxyve.vercel.app): para onde o callback volta.
supabase secrets set --project-ref mxouphopjfoxtfxpfnde APP_URL='https://oxyve.vercel.app'
```

O cron usa o mesmo `app.supabase_url`, `app.service_role_key` e
`app.dispatch_token` (Vault) dos dispatchers de notificação, e a edge confere o
`DISPATCH_TOKEN` que já existe.

## 3. Deploy

```bash
supabase db push                      # migration 20261020120000_conta_azul.sql
supabase functions deploy contaazul-oauth --no-verify-jwt   # callback vem do navegador, sem JWT
supabase functions deploy contaazul-sync
```

`supabase/config.toml` já declara `verify_jwt = false` para `contaazul-oauth`; o
`start` e o `desconectar` conferem o JWT de admin dentro da função.

## 4. Conectar e configurar (Gestão › Conta Azul, só admin)

1. **Conectar Conta Azul** → login no Conta Azul com um usuário **do ERP** da
   empresa (não o do portal) → autorizar. Volta para a Gestão com "Conta Azul conectado".
2. Escolha a **conta financeira** de onde sai o pagamento e o **dia de
   vencimento** (padrão 25; de 1 a 28).
3. Monte o **de-para** (abaixo) e ligue **Enviar relatórios aprovados**.

A partir daí, todo relatório aprovado entra na fila (`pendente`). Relatórios
aprovados **antes** de ligar não vão sozinhos: use **Enviar** na lista.

## Como funciona o de-para

- **Categoria → categoria de despesa do Conta Azul.** Cada categoria do Oxy VE
  precisa de uma. As linhas "(tipo)" — Alimentação, Transporte, Outros — valem
  para as categorias sem correspondência própria; despesa sem categoria cai em
  "Outros". Sem nenhuma das duas, o relatório fica com erro
  `Categoria X sem correspondente no Conta Azul.` e não é enviado.
- **Setor → centro de custo** (opcional). O setor é o da categoria; vazio é
  "Geral". Setor sem centro de custo vai sem centro de custo. Se numa mesma
  categoria uma parte tem centro e outra não, o centro é omitido nessa
  categoria (a observação da conta avisa).
- O rateio é somado em **centavos**: a soma das categorias e dos centros fecha
  exatamente com o valor da conta.

## O que vai na conta a pagar

| Campo | Valor |
|---|---|
| descrição | `Reembolso <nome> — <título do relatório>` |
| competência | data final do relatório |
| valor | soma do reembolsável das despesas aprovadas (não reembolsável fica fora) |
| fornecedor | o funcionário (buscado pelo CPF; criado se não existir) |
| vencimento | próximo dia configurado a partir da aprovação (aprovado até o dia → mesmo mês; depois → mês seguinte) |
| parcela | 1, PIX, na conta financeira configurada |
| referência externa | `oxyve-report-<id>` |
| observação | link do relatório no app e quantidade de itens |

## Status do envio

`Na fila` → `Enviando` → `Enviado` → `Pago e sincronizado`, ou `Erro` com a
mensagem. **Reenviar** devolve o erro para a fila (ou, se a conta já existe lá,
só tenta a baixa de novo). Erro temporário (limite de requisições, Conta Azul
fora do ar) tenta sozinho até 5 vezes.

**Nunca cria duas contas para o mesmo relatório:** o estado vai para
`Enviando` antes do POST; se a resposta não chega, a próxima tentativa procura a
conta no Conta Azul (por referência e por descrição + valor + vencimento) antes
de criar.

**Nunca lança duas baixas para a mesma parcela:** cada baixa é reservada no
banco antes da chamada (cron e "Sincronizar agora" rodando juntos não duplicam)
e a parcela é consultada antes; se a baixa não teve resposta, a próxima
conferência só acontece depois de 10 min.

## Erros comuns

- `Funcionário sem CPF no perfil.` — o colaborador precisa preencher o CPF em
  Configurações › Perfil. Depois, **Reenviar**.
- `O CPF de X já está no Conta Azul sem o perfil Fornecedor.` — a pessoa existe
  lá só como cliente. Marque "Fornecedor" no cadastro dela no Conta Azul e
  reenvie (o Oxy VE não altera cadastro existente).
- `Reconectar` / `O acesso foi revogado...` — a conexão caiu (revogada no
  Conta Azul ou credencial vencida). Clique em **Reconectar**; os pendentes
  seguem depois.
- `a empresa escolhida é diferente da que já estava conectada` — a reconexão
  precisa ser com a mesma empresa do Conta Azul: pessoas, contas e de-para
  salvos pertencem a ela. Trocar de empresa exige limpar a integração com
  ajuda do time técnico.

## Limitações

- **Sem anexo:** a API não recebe arquivo; o comprovante fica no Oxy VE (link na
  observação da conta).
- **Sem apagar:** a API não exclui conta a pagar. Relatório devolvido ou
  corrigido depois de enviado precisa ser ajustado à mão no Conta Azul.
- Mudança no relatório depois de enviado não atualiza a conta lá.
- Limite da API: 10 req/s por conta conectada; o sync espaça as chamadas.
- O refresh token roda a cada renovação; a renovação é feita com trava no banco
  para nunca haver duas ao mesmo tempo. Se uma resposta de renovação se perder
  na rede, é preciso reconectar.
- Os tokens ficam em `contaazul_connection`, legível só pelo `service_role`
  (RLS ligada, sem policy e sem grant para os usuários do app).

## Testes

- Vitest: `src/test/contaazul-*.test.ts` (payload, vencimento, erros, OAuth,
  sync com fetch falso) e `src/test/gestao-conta-azul.test.tsx` (tela).
- SQL: `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/conta_azul.sql`
  (trigger, RLS, idempotência, quitação, trava, cron).
