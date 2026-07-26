import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Receipt, FileText, Camera, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuickExpenseSheet } from '@/components/expenses/QuickExpenseSheet';
import { MoreSheet } from './MoreSheet';

const HINT_STORAGE_KEY = 'oxyve.fab-hint-shown';

// Rotas que vivem dentro do overflow "Mais" — acendem o slot quando ativas.
const MORE_PREFIXES = ['/app/advances', '/app/gestao', '/app/settings', '/app/support'];

const tabBase =
  'relative flex h-16 w-full flex-col items-center justify-center gap-1.5 text-muted-foreground transition-colors duration-150 active:bg-muted/50';
const tabLabel = 'font-mono text-[10px] uppercase leading-none tracking-[0.08em]';

/**
 * Navegação inferior fixa, exclusiva mobile (`block lg:hidden`).
 *
 * 5 slots com a captura DOCADA no centro (é A ação do app no celular):
 *   Início · Despesas · [CAPTURAR] · Relatórios · Mais
 *
 * - "Mais" abre um bottom sheet (MoreSheet) com Adiantamentos, Gestão (admin),
 *   Configurações, Suporte, tema e Sair.
 * - Dock central eleva ~metade acima da barra com `ring-background` (efeito notch
 *   sem clip-path) e respira verde-lima sutil (único pulso permanente do viewport).
 * - Respeita safe-area-inset (iOS PWA standalone) e alvos de toque ≥44px.
 */
export function BottomNav() {
  const location = useLocation();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const moreActive = MORE_PREFIXES.some((p) => location.pathname.startsWith(p));

  // Hint de 1ª aparição — tooltip acima do dock por 3s, uma vez (localStorage).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (!window.localStorage.getItem(HINT_STORAGE_KEY)) {
        setShowHint(true);
        const t = setTimeout(() => {
          setShowHint(false);
          window.localStorage.setItem(HINT_STORAGE_KEY, '1');
        }, 3000);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage indisponível — segue sem hint.
    }
  }, []);

  return (
    <>
      {showHint && (
        <div
          role="tooltip"
          data-testid="capture-hint"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg o2-fade lg:hidden"
        >
          Toque pra fotografar uma nota
        </div>
      )}

      <nav
        aria-label="Navegação principal"
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 block lg:hidden',
          'border-t border-border bg-background/80 backdrop-blur-md'
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="grid grid-cols-5">
          <TabLink to="/app/dashboard" end icon={LayoutDashboard} label="Início" />
          <TabLink to="/app/expenses" icon={Receipt} label="Despesas" />

          {/* Slot central — dock de captura elevado. */}
          <li className="relative flex items-end justify-center pb-1.5">
            <button
              type="button"
              onClick={() => setCaptureOpen(true)}
              aria-label="Capturar despesa por foto"
              className={cn(
                'absolute left-1/2 top-0 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2',
                'items-center justify-center rounded-full',
                'bg-primary text-primary-foreground shadow-lg ring-4 ring-background',
                'transition-transform duration-150 active:scale-95',
                !showHint && '[animation:o2-breathe_6s_cubic-bezier(0.2,0.8,0.2,1)_infinite]'
              )}
            >
              <Camera className="h-6 w-6" aria-hidden="true" />
            </button>
            <span className={cn(tabLabel, 'text-muted-foreground')}>Capturar</span>
          </li>

          <TabLink to="/app/reports" icon={FileText} label="Relatórios" />

          {/* Slot "Mais" — abre overflow sheet. */}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={cn(tabBase, moreActive && 'text-primary')}
            >
              {moreActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary"
                />
              )}
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              <span className={cn(tabLabel, moreActive && 'font-medium')}>Mais</span>
            </button>
          </li>
        </ul>
      </nav>

      <QuickExpenseSheet open={captureOpen} onOpenChange={setCaptureOpen} />
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}

function TabLink({
  to,
  end,
  icon: Icon,
  label,
}: {
  to: string;
  end?: boolean;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) => cn(tabBase, isActive && 'text-primary')}
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary"
              />
            )}
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className={cn(tabLabel, isActive && 'font-medium')}>{label}</span>
          </>
        )}
      </NavLink>
    </li>
  );
}
