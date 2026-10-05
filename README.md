# Oxy VE

Gestão de despesas e reembolsos da O2 Inc. — lançamento pelo celular com leitura do comprovante,
relatório mensal por ciclo (dia 25 ao 24), aprovação e pagamento pela gestão.

- Produção: https://oxyve.vercel.app (login só com Google @o2inc.com.br)
- Stack: React + Vite + TypeScript + Tailwind/shadcn, Supabase (`mxouphopjfoxtfxpfnde`, org O2 Inc.), Vercel

## Rodar local

```sh
cp .env.example .env   # preencha a publishable key e a VAPID pública
npm install
npm run dev            # http://localhost:8080
```

## Banco

Migrations em `supabase/migrations/`; aplicar com `supabase db push`. A primeira organização nasce de
`supabase/seed.sql`. Regras de reembolso (teto de alimentação, janela de 20 dias, despesa após o envio,
reprovação que devolve) ficam no banco — ver as migrations de 2026-09-25 e 2026-09-28.

## Testes

`npm test` (Vitest) · `npx playwright test e2e/login-flow.spec.ts`
