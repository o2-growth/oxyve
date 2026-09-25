import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { SidebarNav } from './SidebarNav';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { useIsMobile } from '@/hooks/use-mobile';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { useDashboardContext } from '@/hooks/useCurrentReport';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: ReactNode;
}

/**
 * Faixa de status do ciclo — chrome de marca O2 ("instrumento financeiro").
 * Lê o ciclo do contexto já cacheado (react-query dedupa com o Dashboard) e
 * degrada para um indicador estático quando ainda não há dado. O ponto respira
 * verde enquanto o ciclo está aberto (relatório em rascunho, acumulando).
 *
 * Regra: UM sinal de prazo por tela. No Início quem fala de prazo é o
 * CurrentReportCard (alerta vermelho ou selo do card), então a faixa mostra só
 * o ciclo. Nas outras telas a faixa é o único sinal — e, se há relatório de
 * ciclo anterior pendente, ela fala dele (o prazo do ciclo novo contradiria).
 */
function CycleRibbon() {
  const { data } = useDashboardContext();
  const { pathname } = useLocation();
  const report = data?.current_report;
  const isOpen = report?.status === 'draft';
  const cycleLabel = report?.cycle_key ? `Ciclo ${report.cycle_key}` : 'Ciclo';
  const daysUntilDue = data?.days_until_due;
  const pending = data?.pending_due_report;
  const onDashboard = pathname.startsWith('/app/dashboard');

  let deadline: { text: string; short: string; urgent: boolean } | null = null;
  if (!onDashboard) {
    if (pending) {
      const late = pending.days_overdue > 0;
      deadline = {
        text: late ? 'Relatório anterior atrasado' : 'Relatório anterior vence hoje',
        short: late ? 'Anterior atrasado' : 'Anterior vence hoje',
        urgent: true,
      };
    } else if (isOpen && typeof daysUntilDue === 'number' && daysUntilDue >= 0) {
      const text = daysUntilDue === 0 ? 'Envio hoje' : `Envio em ${daysUntilDue} ${daysUntilDue === 1 ? 'dia' : 'dias'}`;
      deadline = { text, short: text, urgent: daysUntilDue === 0 };
    }
  }

  return (
    <div className="flex h-8 min-w-0 items-center justify-between gap-2 border-b border-border bg-card/50 px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn('o2-live-dot', !isOpen && 'o2-live-dot--off')} aria-hidden="true" />
        <span className="o2-eyebrow whitespace-nowrap">{cycleLabel}</span>
      </div>
      {deadline && (
        <span className={cn('o2-eyebrow min-w-0 truncate', deadline.urgent && '!text-destructive')}>
          <span className="sm:hidden">{deadline.short}</span>
          <span className="hidden sm:inline">{deadline.text}</span>
        </span>
      )}
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  const isMobile = useIsMobile();

  return (
    <SidebarProvider defaultOpen={!isMobile}>
      {/* Sidebar só existe no desktop (≥lg). No mobile não montamos — nada de
          drawer lateral (DS §10 proíbe); navegação é 100% BottomNav + dock. */}
      {!isMobile && <SidebarNav />}
      <SidebarInset>
        <OfflineBanner />
        <TopBar />
        <CycleRibbon />
        {/* pb-28 no mobile abre espaço pra barra (h-16) + dock elevado + safe-area. */}
        <main className="min-w-0 flex-1 overflow-y-auto bg-background p-4 md:p-6 pb-28 lg:pb-6">
          {children}
        </main>
        <InstallPrompt />
      </SidebarInset>
      <BottomNav />
    </SidebarProvider>
  );
}
