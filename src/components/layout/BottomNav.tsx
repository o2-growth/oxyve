import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Receipt, FileText, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { to: '/app/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/app/expenses', icon: Receipt, label: 'Despesas' },
  { to: '/app/reports', icon: FileText, label: 'Relatórios' },
  { to: '/app/settings/profile', icon: User, label: 'Perfil' },
] as const;

/**
 * Navegação inferior fixa, exclusiva mobile (`block lg:hidden`).
 * - Active state via NavLink + `text-primary` + barra superior fina.
 * - Respeita safe-area-inset (iOS PWA standalone).
 * - Backdrop blur para legibilidade sobre conteúdo rolando.
 */
export function BottomNav() {
  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 block lg:hidden',
        'border-t border-border bg-background/80 backdrop-blur-md',
        'pb-2'
      )}
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
    >
      <ul className="grid grid-cols-4">
        {items.map(({ to, icon: Icon, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/app/dashboard'}
              className={({ isActive }) =>
                cn(
                  'relative flex h-14 flex-col items-center justify-center gap-1',
                  'text-muted-foreground transition-colors',
                  'active:bg-muted/50',
                  isActive && 'text-primary'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary"
                    />
                  )}
                  <Icon className="h-6 w-6" aria-hidden="true" />
                  <span className="text-[10px] font-medium leading-none">
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
