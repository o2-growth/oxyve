import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Receipt,
  FileText,
  Wallet,
  Settings,
  HelpCircle,
  Menu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const mainNavItems = [
  { to: '/app/dashboard', icon: LayoutDashboard, label: 'Início' },
  { to: '/app/expenses', icon: Receipt, label: 'Despesas' },
  { to: '/app/reports', icon: FileText, label: 'Relatórios' },
  { to: '/app/advances', icon: Wallet, label: 'Adiantamentos' },
];

export function MobileSidebar() {
  const location = useLocation();
  const isSettingsActive = location.pathname.startsWith('/app/settings');
  const [open, setOpen] = useState(false);

  const handleNavClick = () => {
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Abrir menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-sidebar text-sidebar-foreground">
        <SheetHeader className="border-b border-sidebar-border px-4 py-4">
          <SheetTitle className="flex items-center gap-2 text-sidebar-foreground">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
              <Receipt className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <span className="text-lg font-semibold">ExpenseHub</span>
          </SheetTitle>
        </SheetHeader>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={handleNavClick}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
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

          <NavLink
            to="/app/settings/policy"
            onClick={handleNavClick}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
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
            onClick={handleNavClick}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
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

        <div className="border-t border-sidebar-border p-4">
          <p className="text-xs text-sidebar-foreground/50">
            © 2024 ExpenseHub
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
