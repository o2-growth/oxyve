-- Onda 4 — Painel Admin / Gestão Financeira
-- Estrutura o "setor/área" nas categorias, extraído do nome (ex.: "Alimentação –
-- Comercial" → Comercial). É editável depois pelo painel admin (CRUD de categorias).
-- O painel agrupa despesas por setor a partir daqui.

BEGIN;

ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS sector text;

-- Classificação por nome (ordem: mais específico primeiro não é necessário —
-- cada categoria carrega no máximo um setor no nome).
UPDATE public.expense_categories SET sector = 'Administrativo' WHERE sector IS NULL AND name ILIKE '%administrativo%';
UPDATE public.expense_categories SET sector = 'Comercial'      WHERE sector IS NULL AND name ILIKE '%comercial%';
UPDATE public.expense_categories SET sector = 'Marketing'      WHERE sector IS NULL AND name ILIKE '%marketing%';
UPDATE public.expense_categories SET sector = 'Expansão'       WHERE sector IS NULL AND name ILIKE '%expans%';
UPDATE public.expense_categories SET sector = 'Tax'            WHERE sector IS NULL AND name ILIKE '%tax%';
UPDATE public.expense_categories SET sector = 'CaaS'           WHERE sector IS NULL AND name ILIKE '%caas%';
UPDATE public.expense_categories SET sector = 'Customer Success' WHERE sector IS NULL AND (name ILIKE '%customer%' OR name ILIKE '%sucess%');
UPDATE public.expense_categories SET sector = 'Education'      WHERE sector IS NULL AND name ILIKE '%education%';
UPDATE public.expense_categories SET sector = 'SaaS'          WHERE sector IS NULL AND name ILIKE '%saas%';
-- Restante fica NULL = "Geral" (Hospedagem, Software, Materiais, Outros, Eventos Internos…).

COMMIT;
