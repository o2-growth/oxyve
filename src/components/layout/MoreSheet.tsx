import { NavLink, useLocation } from 'react-router-dom';
import {
  Wallet,
  LineChart,
  User,
  Settings,
  HelpCircle,
  LucideIcon,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { O2Rings } from '@/components/brand/O2Rings';
import { cn } from '@/lib/utils';

interface MoreItem {
  to: string;
  icon: LucideIcon;
  label: string;
  matchPrefix?: string;
}

interface MoreGroup {
  key: string;
  title: string;
  adminOnly?: boolean;
  items: MoreItem[];
}

/**
 * Grupos do overflow mobile. Espelha a navegação da SidebarNav desktop —
 * tudo que não cabe nas 4 abas fixas da BottomNav vive aqui, agrupado.
 */
const GROUPS: MoreGroup[] = [
  {
    key: 'operacao',
    title: 'Operação',
    items: [{ to: '/app/advances', icon: Wallet, label: 'Adiantamentos' }],
  },
  {
    key: 'admin',
    title: 'Administração',
    adminOnly: true,
    items: [{ to: '/app/gestao', icon: LineChart, label: 'Gestão' }],
  },
  {
    key: 'conta',
    title: 'Conta',
    items: [
      { to: '/app/settings/profile', icon: User, label: 'Meu perfil' },
      {
        to: '/app/settings/policy',
        icon: Settings,
        label: 'Configurações',
        matchPrefix: '/app/settings',
      },
      { to: '/app/support', icon: HelpCircle, label: 'Suporte' },
    ],
  },
];

interface MoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
}

/**
 * Bottom sheet "Mais" — overflow de navegação mobile (< lg).
 * Alcança rotas que não cabem nas abas fixas da BottomNav. Fecha ao navegar,
 * no backdrop e no Esc (padrão Radix Dialog do shadcn Sheet).
 */
export function MoreSheet({ open, onOpenChange, isAdmin }: MoreSheetProps) {
  const location = useLocation();

  const isActive = (item: MoreItem) =>
    item.matchPrefix
      ? location.pathname.startsWith(item.matchPrefix)
      : location.pathname === item.to;

  const groups = GROUPS.filter((g) => !g.adminOnly || isAdmin);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-[20px] border-t border-border bg-popover p-0 pb-[env(safe-area-inset-bottom)]"
      >
        {/* Handle de arraste (visual) */}
        <div
          aria-hidden="true"
          className="mx-auto mt-3 h-1 w-9 rounded-full bg-muted-foreground/30"
        />

        <SheetHeader className="flex-row items-center gap-2.5 space-y-0 px-5 pb-1 pt-4 text-left">
          <O2Rings size={18} className="shrink-0" />
          <SheetTitle className="o2-eyebrow p-0">Menu</SheetTitle>
        </SheetHeader>

        <nav className="pb-2">
          {groups.map((group) => (
            <div key={group.key} className="border-t border-border first:border-t-0">
              <p className="o2-eyebrow px-5 pb-1 pt-4 text-muted-foreground/70">
                {group.title}
              </p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    'flex h-14 items-center gap-3 px-5 text-[15px] font-medium text-foreground transition-colors duration-150 active:bg-muted/50',
                    isActive(item) &&
                      'border-l-2 border-primary pl-[calc(1.25rem-2px)] text-primary',
                  )}
                >
                  <item.icon
                    className={cn(
                      'h-5 w-5 shrink-0',
                      isActive(item) ? 'text-primary' : 'text-muted-foreground',
                    )}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}

          {/* Tema — controle vive aqui no mobile (sai do TopBar) */}
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <span className="o2-eyebrow text-muted-foreground/70">Tema</span>
            <ThemeToggle />
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
