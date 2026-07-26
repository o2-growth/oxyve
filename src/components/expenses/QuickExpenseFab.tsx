/**
 * Sprint 6 — Camera-first FAB (DESKTOP-ONLY).
 *
 * No mobile a captura vive docada no centro da BottomNav; aqui é só o atalho
 * flutuante do desktop (`hidden lg:flex`). Abre o `QuickExpenseSheet` no file
 * picker. Visível em /app/dashboard, /app/expenses, /app/reports.
 */
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Camera, Plus } from 'lucide-react';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';
import { QuickExpenseSheet } from './QuickExpenseSheet';
import { cn } from '@/lib/utils';

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

  if (!isVisibleOn(location.pathname)) {
    return null;
  }

  return (
    <>
      <FloatingActionButton
        icon={Camera}
        badgeIcon={Plus}
        label="Nova despesa por foto"
        onClick={() => setOpen(true)}
        // Desktop-only — no mobile quem captura é o dock da BottomNav.
        // Breathe verde-lima MUITO sutil (reduced-motion é global no index.css).
        className={cn(
          'hidden lg:flex',
          '[animation:o2-breathe_6s_cubic-bezier(0.2,0.8,0.2,1)_infinite]'
        )}
      />
      <QuickExpenseSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
