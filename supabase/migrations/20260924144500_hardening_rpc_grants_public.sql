-- Corrige a 20260924143000: revogar de anon/authenticated não bastava.
--
-- A ACL destas funções era "=X/postgres", isto é, EXECUTE concedido a PUBLIC.
-- anon e authenticated herdam de PUBLIC, então revogar dos papéis nomeados não
-- tirava nada — verificado explorando o endpoint depois daquela migration, que
-- continuou respondendo 200.
--
-- O corte precisa ser em PUBLIC, e o acesso legítimo volta por GRANT explícito.

revoke execute on function public.create_notification(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.dispatch_pending_notification_emails() from public, anon, authenticated;
revoke execute on function public.dispatch_pending_notification_pushes() from public, anon, authenticated;

-- Oráculos: fora de PUBLIC, de volta só para quem está autenticado. Elas
-- sustentam as policies de RLS de quase todas as tabelas, então authenticated
-- precisa mesmo executá-las; o que não podia era responder a quem não fez login.
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.is_manager_or_admin(uuid) from public, anon;
revoke execute on function public.get_user_org_id(uuid) from public, anon;

grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.is_manager_or_admin(uuid) to authenticated, service_role;
grant execute on function public.get_user_org_id(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
