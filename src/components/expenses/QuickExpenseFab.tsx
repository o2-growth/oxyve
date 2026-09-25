/**
 * Atalho de captura por foto no DESKTOP — agora um botão "Capturar" dentro do
 * TopBar, não mais um FAB flutuante.
 *
 * Por quê: o FAB fixo no canto inferior direito cobria o fim das tabelas
 * (coluna Valor, botões Aprovar/Reprovar, lixeira). Nenhum padding-bottom
 * resolve colunas à direita em telas largas; no TopBar a ação continua a um
 * clique, sempre visível, e não disputa espaço com o conteúdo.
 *
 * No mobile a captura vive docada no centro da BottomNav (`lg:hidden`), então
 * aqui é `hidden lg:inline-flex`. Visível em /app/dashboard, /app/expenses,
 * /app/reports.
 */
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuickExpenseSheet } from './QuickExpenseSheet';

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
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Nova despesa por foto"
        title="Nova despesa por foto"
        className="hidden h-9 gap-2 lg:inline-flex"
      >
        <Camera className="h-4 w-4" aria-hidden="true" />
        Capturar
      </Button>
      <QuickExpenseSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
