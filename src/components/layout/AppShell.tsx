import { ReactNode } from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { SidebarNav } from './SidebarNav';
import { TopBar } from './TopBar';
import { useIsMobile } from '@/hooks/use-mobile';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const isMobile = useIsMobile();

  return (
    <SidebarProvider defaultOpen={!isMobile}>
      <SidebarNav />
      <SidebarInset>
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-background p-4 md:p-6 pb-24 md:pb-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
