-- Data lida da nota (OCR). Data divergente do dia da despesa não bloqueia mais o
-- lançamento: o app grava aqui a data da nota e o gestor vê o selo
-- "Data da nota diferente" na revisão. Só aditivo; tg_expenses_guard_client não
-- mexe nesta coluna.
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS receipt_date date;
