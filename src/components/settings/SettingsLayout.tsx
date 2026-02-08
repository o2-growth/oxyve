import { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { FileText, User, Lock, Users } from 'lucide-react';

interface SettingsLayoutProps {
  children: ReactNode;
}

const settingsLinks = [
  {
    to: '/app/settings/policy',
    label: 'Política de Despesa',
    icon: FileText,
    adminOnly: true,
  },
  {
    to: '/app/settings/team',
    label: 'Equipe',
    icon: Users,
    adminOnly: true,
  },
  {
    to: '/app/settings/profile',
    label: 'Meus Dados',
    icon: User,
    adminOnly: false,
  },
  {
    to: '/app/settings/password',
    label: 'Mudar Senha',
    icon: Lock,
    adminOnly: false,
  },
];

export function SettingsLayout({ children }: SettingsLayoutProps) {
  const { isAdmin } = useAuth();

  const visibleLinks = settingsLinks.filter(
    (link) => !link.adminOnly || isAdmin
  );

  return (
    <div className="flex gap-8">
      {/* Sidebar */}
      <aside className="w-56 shrink-0">
        <nav className="space-y-1">
          {visibleLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
