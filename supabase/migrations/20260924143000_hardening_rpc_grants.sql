-- Fecha RPCs SECURITY DEFINER que estavam abertas ao papel anon.
--
-- create_notification tinha EXECUTE para anon e authenticated e não olhava
-- auth.uid(): recebia p_user_id, p_title, p_body e p_link e escrevia direto em
-- notifications. Como a anon key é pública por natureza — vai no bundle do
-- front — qualquer pessoa podia criar notificação para qualquer usuário, com
-- texto e link arbitrários. Os crons entregam isso como push (já ativo) e como
-- e-mail assim que houver RESEND_API_KEY, ou seja: phishing saindo do domínio.
-- Verificado por exploração contra o projeto antes desta migration.
-- Quem cria notificação de verdade é tg_reports_audit, que é SECURITY DEFINER
-- de owner postgres e por isso não depende deste grant.
revoke execute on function public.create_notification(uuid, text, text, text, text) from anon, authenticated;

-- Dispatchers são acionados pelo pg_cron, que roda como postgres. Expostos,
-- deixavam qualquer um forçar a varredura da fila fora de hora.
revoke execute on function public.dispatch_pending_notification_emails() from anon, authenticated;
revoke execute on function public.dispatch_pending_notification_pushes() from anon, authenticated;

-- Oráculos de identidade: aceitam um user_id qualquer e respondem sobre ele.
-- Sem login era possível descobrir a organização de um usuário e se ele é
-- admin — reconhecimento que transforma o abuso acima em phishing dirigido.
-- O grant para authenticated PERMANECE: estas três sustentam as policies de RLS
-- de praticamente todas as tabelas (expenses, profiles, objects, reports...),
-- e tirá-lo derrubaria o acesso de todo usuário legítimo.
revoke execute on function public.has_role(uuid, public.app_role) from anon;
revoke execute on function public.is_manager_or_admin(uuid) from anon;
revoke execute on function public.get_user_org_id(uuid) from anon;
