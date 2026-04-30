import { ReactNode } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { SidebarNav } from './SidebarNav';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { useIsMobile } from '@/hooks/use-mobile';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { QuickExpenseFab } from '@/components/expenses/QuickExpenseFab';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const isMobile = useIsMobile();

  return (
    <SidebarProvider defaultOpen={!isMobile}>
      <SidebarNav />
      <SidebarInset>
        <OfflineBanner />
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-background p-4 md:p-6 pb-24 lg:pb-6">
          {children}
        </main>
        <InstallPrompt />
      </SidebarInset>
      <BottomNav />
      <QuickExpenseFab />
    </SidebarProvider>
  );
}
