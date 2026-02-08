import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Receipt,
  FileText,
  Wallet,
  Settings,
  HelpCircle,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useState } from 'react';

const mainNavItems = [
  { to: '/app/dashboard', icon: LayoutDashboard, label: 'Início' },
  { to: '/app/expenses', icon: Receipt, label: 'Despesas' },
  { to: '/app/reports', icon: FileText, label: 'Relatórios' },
  { to: '/app/advances', icon: Wallet, label: 'Adiantamentos' },
];

const settingsNavItems = [
  { to: '/app/settings/profile', label: 'Meu Perfil' },
  { to: '/app/settings/password', label: 'Alterar Senha' },
];

export function SidebarNav() {
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(
    location.pathname.startsWith('/app/settings')
  );

  return (
    <aside className="flex w-64 flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
          <Receipt className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        <span className="text-lg font-semibold">ExpenseHub</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {mainNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}

        {/* Settings Collapsible */}
        <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground">
            <Settings className="h-5 w-5" />
            <span className="flex-1 text-left">Configurações</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                settingsOpen && 'rotate-180'
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pl-8 pt-1">
            {settingsNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'block rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </CollapsibleContent>
        </Collapsible>

        <NavLink
          to="/app/support"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            )
          }
        >
          <HelpCircle className="h-5 w-5" />
          Suporte
        </NavLink>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-4">
        <p className="text-xs text-sidebar-foreground/50">
          © 2024 ExpenseHub
        </p>
      </div>
    </aside>
  );
}
