-- A lista de relatórios pede o nome do dono com `user:profiles!user_id(full_name)`
-- (useReports.ts). O PostgREST só resolve esse embed se existir FK de
-- reports.user_id para profiles — e a única FK era para auth.users. No banco do
-- Lovable Cloud essa FK existia fora das migrations; ao recriar o projeto ela se
-- perdeu e toda listagem de relatórios passou a voltar 400 (Relatórios, fila de
-- aprovação e Gestão vazios para todo mundo).
--
-- profiles.id é o próprio auth.users.id (profiles_id_fkey, ON DELETE CASCADE),
-- então a FK nova não restringe nada que a antiga já não restringisse.

ALTER TABLE public.reports
  ADD CONSTRAINT reports_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
