

# Criar conta admin para telma.feijo@o2inc.com.br

## Situacao atual

- Existe uma organizacao "Minha Empresa" (id: `21b53d25-aa01-45dc-a64a-9f239a32d4f7`)
- O usuario "andrey lopes" ja e admin dessa org
- Nao existe convite pendente para telma.feijo@o2inc.com.br

## O que sera feito

1. **Inserir um convite na tabela `org_invites`** com:
   - email: `telma.feijo@o2inc.com.br`
   - org_id: `21b53d25-aa01-45dc-a64a-9f239a32d4f7`
   - role: `admin`
   - invited_by: usuario atual (andrey)
   - expires_at: 30 dias a partir de agora (para dar tempo)

2. **Registrar o dominio `o2inc.com.br`** na tabela `org_domains` para que futuros usuarios desse dominio entrem automaticamente na org

## Fluxo para a Telma

1. Telma acessa o app e clica em "Criar conta"
2. Preenche email `telma.feijo@o2inc.com.br`, senha e nome
3. O sistema `bootstrap_user` detecta o convite pendente
4. Perfil e criado automaticamente com role `admin`
5. Telma tera acesso a aprovacao de relatorios, politica de despesas e gestao de equipe

## Detalhes tecnicos

- Nenhuma alteracao de codigo necessaria
- Apenas operacoes de dados (INSERT) nas tabelas `org_invites` e `org_domains`
- O bootstrap_user ja trata convites pendentes corretamente

