import { ReactNode } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { SidebarNav } from './SidebarNav';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { useIsMobile } from '@/hooks/use-mobile';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { QuickExpenseFab } from '@/components/expenses/QuickExpenseFab';
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
 */
function CycleRibbon() {
  const { data } = useDashboardContext();
  const report = data?.current_report;
  const isOpen = report?.status === 'draft';
  const cycleLabel = report?.cycle_key ? `Ciclo ${report.cycle_key}` : 'Ciclo';
  const daysUntilDue = data?.days_until_due;

  return (
    <div className="flex h-8 items-center justify-between border-b border-border bg-card/50 px-4 md:px-6">
      <div className="flex items-center gap-2">
        <span className={cn('o2-live-dot', !isOpen && 'o2-live-dot--off')} aria-hidden="true" />
        <span className="o2-eyebrow">{cycleLabel}</span>
      </div>
      {typeof daysUntilDue === 'number' && daysUntilDue >= 0 && (
        <span className="o2-eyebrow">Prazo em {daysUntilDue}d</span>
      )}
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  const isMobile = useIsMobile();

  return (
    <SidebarProvider defaultOpen={!isMobile}>
      <SidebarNav />
      <SidebarInset>
        <OfflineBanner />
        <TopBar />
        <CycleRibbon />
        <main className="flex-1 overflow-y-auto bg-background p-4 md:p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6">
          {children}
        </main>
        <InstallPrompt />
      </SidebarInset>
      <BottomNav />
      {/* FAB flutuante é desktop-only; no mobile a BottomNav tem o FAB docado */}
      {!isMobile && <QuickExpenseFab />}
    </SidebarProvider>
  );
}
