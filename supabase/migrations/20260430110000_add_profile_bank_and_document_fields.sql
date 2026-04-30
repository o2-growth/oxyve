-- Sprint 1 — GAP-G021 + GAP-G022
-- Adiciona campos bancários e CPF/CNPJ ao profile.
-- Migration somente cria estrutura; aplicação fica para o Lovable depois (DEC-005).

BEGIN;

-- Enum para o tipo de chave PIX (GAP-G021).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pix_key_type') THEN
    CREATE TYPE public.pix_key_type AS ENUM ('cpf', 'cnpj', 'email', 'phone', 'random');
  END IF;
END$$;

-- Campos bancários (GAP-G021).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bank_name     text,
  ADD COLUMN IF NOT EXISTS bank_branch   text,
  ADD COLUMN IF NOT EXISTS bank_account  text,
  ADD COLUMN IF NOT EXISTS pix_key       text,
  ADD COLUMN IF NOT EXISTS pix_key_type  public.pix_key_type;

-- CPF / CNPJ (GAP-G022).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf_cnpj text;

-- Comentários para documentação no Supabase Studio.
COMMENT ON COLUMN public.profiles.bank_name    IS 'Nome do banco (ex.: "Itaú", "Nubank") — opcional, usado para reembolso.';
COMMENT ON COLUMN public.profiles.bank_branch  IS 'Agência bancária (formato livre).';
COMMENT ON COLUMN public.profiles.bank_account IS 'Conta corrente / poupança (formato livre).';
COMMENT ON COLUMN public.profiles.pix_key      IS 'Chave PIX (formato depende de pix_key_type).';
COMMENT ON COLUMN public.profiles.pix_key_type IS 'Tipo da chave PIX: cpf | cnpj | email | phone | random.';
COMMENT ON COLUMN public.profiles.cpf_cnpj     IS 'CPF (11 dígitos) ou CNPJ (14 dígitos), apenas dígitos.';

COMMIT;
