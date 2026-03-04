

# Mover Telma para a organização com os centros de custo

A Telma está atualmente na org `70aa944f-f8bd-4bb9-8498-ff5c9ec998c8`, mas os centros de custo (Administrativo, Alimentação, etc.) estão na org `21b53d25-aa01-45dc-a64a-9f239a32d4f7`. Vou atualizar o `org_id` do perfil da Telma para essa organização.

## Alteração

Executar um UPDATE na tabela `profiles` para mudar o `org_id` da Telma (`b2d20eff-d131-4db7-98a2-d2523408f0f2`) de `70aa944f-...` para `21b53d25-aa01-45dc-a64a-9f239a32d4f7`.

Após isso, a Telma verá os mesmos centros de custo, categorias, departamentos e projetos que os outros usuários (Joao Victor e Andrey).

