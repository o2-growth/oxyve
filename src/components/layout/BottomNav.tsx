import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Receipt,
  FileText,
  MoreHorizontal,
  Camera,
  LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { QuickExpenseSheet } from '@/components/expenses/QuickExpenseSheet';
import { MoreSheet } from './MoreSheet';

// Rotas que "acendem" a aba Mais (vivem dentro do overflow, não têm aba fixa).
const MORE_PREFIXES = ['/app/advances', '/app/gestao', '/app/settings', '/app/support'];

const TAB_BASE =
  'relative flex h-16 flex-col items-center justify-center gap-1.5 ' +
  'text-muted-foreground transition-colors duration-150 active:bg-muted/50';

const TAB_LABEL = 'font-mono text-[10px] uppercase leading-none tracking-[0.08em]';

function ActiveHairline() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary"
    />
  );
}

function TabLink({
  to,
  icon: Icon,
  label,
  end,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn(TAB_BASE, isActive && 'text-primary')}
    >
      {({ isActive }) => (
        <>
          {isActive && <ActiveHairline />}
          <Icon className="h-5 w-5" aria-hidden="true" />
          <span className={cn(TAB_LABEL, isActive && 'font-medium')}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

/**
 * Navegação inferior fixa, exclusiva mobile (`lg:hidden`).
 * Cinco slots: Início · Despesas · [FAB Nova despesa] · Relatórios · Mais.
 * - FAB central docado abre a captura de despesa (câmera-first no mobile).
 * - "Mais" abre o MoreSheet com o overflow (Adiantamentos, Gestão, Conta).
 * - Respeita safe-area-inset (iOS PWA standalone); backdrop blur pra legibilidade.
 */
export function BottomNav() {
  const location = useLocation();
  const { isAdmin } = useAuth();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActive =
    moreOpen || MORE_PREFIXES.some((p) => location.pathname.startsWith(p));

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 block lg:hidden',
          'border-t border-border bg-background/85 backdrop-blur-md'
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="grid grid-cols-5">
          <li>
            <TabLink to="/app/dashboard" end icon={LayoutDashboard} label="Início" />
          </li>
          <li>
            <TabLink to="/app/expenses" icon={Receipt} label="Despesas" />
          </li>

          {/* FAB docado — ação primária (lançar despesa), não é rota */}
          <li className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setCaptureOpen(true)}
              aria-label="Nova despesa"
              className={cn(
                '-translate-y-4 flex h-14 w-14 items-center justify-center rounded-full',
                'bg-primary text-primary-foreground shadow-lg ring-4 ring-background',
                'transition-transform duration-150 active:scale-95'
              )}
            >
              <Camera className="h-6 w-6" aria-hidden="true" />
            </button>
          </li>

          <li>
            <TabLink to="/app/reports" icon={FileText} label="Relatórios" />
          </li>

          {/* Mais — abre o overflow sheet */}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={cn(TAB_BASE, 'w-full', moreActive && 'text-primary')}
            >
              {moreActive && <ActiveHairline />}
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              <span className={cn(TAB_LABEL, moreActive && 'font-medium')}>Mais</span>
            </button>
          </li>
        </ul>
      </nav>

      <QuickExpenseSheet open={captureOpen} onOpenChange={setCaptureOpen} />
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} isAdmin={isAdmin} />
    </>
  );
}
