import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  LineChart,
  Settings,
  HelpCircle,
  LogOut,
  ChevronRight,
  Moon,
  type LucideIcon,
} from 'lucide-react';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface MoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Overflow de navegação mobile — bottom sheet ancorado na BottomNav (NÃO é o
 * drawer lateral banido pelo DS). Reúne o que não cabe nos 5 slots: perfil,
 * Adiantamentos, Gestão (só admin), Configurações, Suporte, tema e Sair.
 */
export function MoreSheet({ open, onOpenChange }: MoreSheetProps) {
  const navigate = useNavigate();
  const { user, profile, signOut, isAdmin, isManager } = useAuth();

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  const handleSignOut = async () => {
    onOpenChange(false);
    await signOut();
    navigate('/login');
  };

  const initials = (() => {
    if (profile?.full_name) {
      return profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return user?.email?.slice(0, 2).toUpperCase() || 'U';
  })();

  const roleLabel = isAdmin ? 'Admin' : isManager ? 'Gestor' : 'Colaborador';
  const roleVariant = isAdmin ? 'default' : isManager ? 'secondary' : 'outline';

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="lg:hidden">
        {/* Título acessível (visualmente oculto — o conteúdo já se explica). */}
        <DrawerTitle className="sr-only">Mais opções</DrawerTitle>

        <div
          className="mx-auto w-full max-w-md px-2 pb-2 pt-1"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
        >
          {/* Header de perfil — toque leva ao perfil pessoal. */}
          <button
            type="button"
            onClick={() => go('/app/settings/profile')}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-150 active:bg-muted/60"
          >
            <Avatar className="h-11 w-11">
              <AvatarFallback className="bg-primary text-sm font-medium text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium leading-tight">
                {profile?.full_name || 'Usuário'}
              </p>
              <p className="o2-num truncate text-xs leading-tight text-muted-foreground">
                {user?.email}
              </p>
            </div>
            <Badge variant={roleVariant}>{roleLabel}</Badge>
          </button>

          <div className="my-1 h-px bg-border" aria-hidden="true" />

          <MoreRow icon={Wallet} label="Adiantamentos" onClick={() => go('/app/advances')} />
          {isAdmin && (
            <MoreRow icon={LineChart} label="Gestão" onClick={() => go('/app/gestao')} />
          )}
          <MoreRow icon={Settings} label="Configurações" onClick={() => go('/app/settings/profile')} />
          <MoreRow icon={HelpCircle} label="Suporte" onClick={() => go('/app/support')} />

          <div className="my-1 h-px bg-border" aria-hidden="true" />

          {/* Tema — toggle inline (removido da TopBar no mobile). */}
          <div className="flex items-center justify-between rounded-xl px-3 py-2.5">
            <span className="flex items-center gap-3 text-sm">
              <Moon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              Tema
            </span>
            <ThemeToggle />
          </div>

          <div className="my-1 h-px bg-border" aria-hidden="true" />

          <MoreRow icon={LogOut} label="Sair" onClick={handleSignOut} destructive />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function MoreRow({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm',
        'transition-colors duration-150 active:bg-muted/60',
        destructive ? 'text-destructive' : 'text-foreground'
      )}
    >
      <Icon
        className={cn('h-5 w-5', destructive ? 'text-destructive' : 'text-muted-foreground')}
        aria-hidden="true"
      />
      <span className="flex-1">{label}</span>
      {!destructive && (
        <ChevronRight className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
      )}
    </button>
  );
}
