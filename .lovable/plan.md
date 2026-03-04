

# Confirmar email da Telma

O email da Telma (telma.feijo@o2inc.com.br) foi cadastrado mas está pendente de confirmação. Para resolver isso, vou executar uma migration SQL que confirma o email diretamente na tabela `auth.users`.

## Alteração

Executar um UPDATE na tabela `auth.users` para marcar o email como confirmado, setando `email_confirmed_at` para o timestamp atual. Isso é feito via migration com `UPDATE auth.users SET email_confirmed_at = now() WHERE email = 'telma.feijo@o2inc.com.br'`.

Após isso, a Telma poderá fazer login com as credenciais que foram usadas no cadastro.

