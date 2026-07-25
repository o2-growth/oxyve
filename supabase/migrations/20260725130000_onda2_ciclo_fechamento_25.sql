-- Onda 2 — Ciclo de fechamento do relatório: dia 25 (mês anterior) → dia 24 (mês atual)
--
-- Regra do negócio: "relatório do mês N cobre de 25/(N-1) 00:00 até 24/N 23:59:59",
-- com o dia 24 INCLUSIVE (create_expense_in_current_report usa date BETWEEN start AND end).
-- A máquina de ciclo (get_or_create_report_for_date) já é parametrizada por
-- expense_policies.cycle_cutoff_day — bastava virar o valor de 24 para 25.
--
-- Backfill: relatórios em `draft` (ainda editáveis) recebem os novos boundaries.
-- Como a mudança 24→25 desloca cada data em exatamente +1 dia, o ajuste é
-- start/end/due += 1 dia; cycle_key não muda (segue o mês do due_date).
-- Relatórios `submitted` NÃO são alterados (já foram fechados naquele período).
-- Auditado: nenhuma despesa existente cai em dia de fronteira (23/24/25), logo
-- o deslocamento não órfã nenhuma despesa (associação despesa↔relatório é por data).

BEGIN;

UPDATE public.expense_policies
   SET cycle_cutoff_day = 25
 WHERE cycle_cutoff_day <> 25;

ALTER TABLE public.expense_policies
  ALTER COLUMN cycle_cutoff_day SET DEFAULT 25;

UPDATE public.reports
   SET start_date = start_date + 1,
       end_date   = end_date + 1,
       due_date   = due_date + 1
 WHERE status = 'draft';

COMMIT;
