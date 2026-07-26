/**
 * Sprint 6 — Camera-first FAB.
 *
 * Botão flutuante que abre o `QuickExpenseSheet` direto na câmera
 * (mobile) ou file picker (desktop). Visível em /app/dashboard,
 * /app/expenses, /app/reports — escondido em /app/settings/* e demais.
 *
 * Inclui hint de primeira aparição via localStorage e pulse animation
 * pra chamar atenção até o user dispensar.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Camera, Plus } from 'lucide-react';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';
import { QuickExpenseSheet } from './QuickExpenseSheet';
import { cn } from '@/lib/utils';

const HINT_STORAGE_KEY = 'oxyve.fab-hint-shown';

const VISIBLE_PATH_PREFIXES = [
  '/app/dashboard',
  '/app/expenses',
  '/app/reports',
];

function isVisibleOn(pathname: string): boolean {
  return VISIBLE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function QuickExpenseFab() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Detect first appearance — pulse + tooltip por 3s.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const seen = window.localStorage.getItem(HINT_STORAGE_KEY);
      if (!seen) {
        setShowHint(true);
        const t = setTimeout(() => {
          setShowHint(false);
          window.localStorage.setItem(HINT_STORAGE_KEY, '1');
        }, 3000);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage indisponível (ex.: testing) — segue sem hint.
    }
  }, []);

  if (!isVisibleOn(location.pathname)) {
    return null;
  }

  return (
    <>
      {showHint && (
        <div
          role="tooltip"
          data-testid="fab-hint"
          className={cn(
            'fixed right-20 bottom-24 lg:bottom-10 z-50',
            'rounded-lg bg-foreground text-background',
            'px-3 py-2 text-xs shadow-lg',
            'animate-fade-in'
          )}
        >
          Toque pra fotografar uma nota
        </div>
      )}
      <FloatingActionButton
        icon={Camera}
        badgeIcon={Plus}
        label="Nova despesa por foto"
        onClick={() => setOpen(true)}
        pulse={showHint}
        responsive
        // Breathe verde-lima MUITO sutil — o único pulso do viewport.
        // Durante o hint inicial cede a vez pro pulse; reduced-motion é global.
        className={cn(
          !showHint &&
            '[animation:o2-breathe_6s_cubic-bezier(0.2,0.8,0.2,1)_infinite]'
        )}
      />
      <QuickExpenseSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
