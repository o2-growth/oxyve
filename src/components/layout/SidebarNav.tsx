import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Receipt,
  FileText,
  Wallet,
  Settings,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const mainNavItems = [
  { to: '/app/dashboard', icon: LayoutDashboard, label: 'Início' },
  { to: '/app/expenses', icon: Receipt, label: 'Despesas' },
  { to: '/app/reports', icon: FileText, label: 'Relatórios' },
  { to: '/app/advances', icon: Wallet, label: 'Adiantamentos' },
];

export function SidebarNav() {
  const location = useLocation();
  const isSettingsActive = location.pathname.startsWith('/app/settings');

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

        {/* Settings Link */}
        <NavLink
          to="/app/settings/policy"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            isSettingsActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
          )}
        >
          <Settings className="h-5 w-5" />
          Configurações
        </NavLink>

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
