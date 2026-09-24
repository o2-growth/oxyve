-- Remove o agendamento duplicado do dispatcher de push.
--
-- 20260430220000 agendou dispatch_pending_notification_pushes e, minutos
-- depois, 20260430223707 agendou a MESMA função como
-- "dispatch-pending-notification-pushes" (hífen). Os dois rodam de minuto em
-- minuto sobre a mesma fila; quem chega primeiro carimba pushed_at e o outro
-- varre à toa — com janela para as duas execuções pegarem a mesma linha antes
-- do carimbo e o device receber a notificação duas vezes.
--
-- Fica o nome com underscore, consistente com o dispatcher de e-mail.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dispatch-pending-notification-pushes') then
    perform cron.unschedule('dispatch-pending-notification-pushes');
  end if;
end $$;
