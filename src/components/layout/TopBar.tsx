import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LogOut, User, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { NotificationsBell } from '@/components/notifications/NotificationsBell';
import { O2Rings } from '@/components/brand/O2Rings';

export function TopBar() {
  const { user, profile, signOut, isAdmin, isManager } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return user?.email?.slice(0, 2).toUpperCase() || 'U';
  };

  const getRoleBadge = () => {
    if (isAdmin) return <Badge variant="default">Admin</Badge>;
    if (isManager) return <Badge variant="secondary">Gestor</Badge>;
    return <Badge variant="outline">Colaborador</Badge>;
  };

  return (
    <header
      className="flex h-14 md:h-16 items-center justify-between border-b border-border bg-card px-4 md:px-6"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-3">
        {/* Sidebar trigger + sessão — desktop only (mobile usa BottomNav) */}
        <SidebarTrigger className="hidden lg:flex h-8 w-8" />
        <div className="hidden lg:flex items-center gap-2">
          <span className="o2-live-dot" aria-hidden="true" />
          <span className="o2-eyebrow">Sessão ativa</span>
        </div>
        {/* Marca O2 — mobile only (herda a assinatura que vivia na sidebar) */}
        <div className="flex lg:hidden items-center gap-2.5">
          <O2Rings size={22} className="shrink-0" />
          <span className="font-display text-lg uppercase leading-none tracking-wide">
            Oxy VE
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 md:gap-2">
        <NotificationsBell />
        {/* Tema — desktop no TopBar; no mobile vive no rodapé do MoreSheet */}
        <span className="hidden lg:inline-flex">
          <ThemeToggle />
        </span>
        <div className="hidden sm:block ml-1">
          {getRoleBadge()}
        </div>

        <span className="hidden sm:block h-6 w-px bg-border mx-1" aria-hidden="true" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-9 w-9 md:h-10 md:w-10 rounded-full transition-colors duration-150 hover:bg-muted"
            >
              <Avatar className="h-9 w-9 md:h-10 md:w-10">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1.5">
                <p className="text-sm font-medium leading-none">
                  {profile?.full_name || 'Usuário'}
                </p>
                <p className="o2-num text-xs leading-none text-muted-foreground truncate">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="sm:hidden px-2 py-1.5">
              {getRoleBadge()}
            </div>
            <DropdownMenuSeparator className="sm:hidden" />
            <DropdownMenuItem onClick={() => navigate('/app/settings/profile')}>
              <User className="mr-2 h-4 w-4" />
              Meu Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/app/settings/password')}>
              <Settings className="mr-2 h-4 w-4" />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
