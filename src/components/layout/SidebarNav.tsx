import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Receipt,
  FileText,
  Wallet,
  LineChart,
  Settings,
  HelpCircle,
  ChevronsLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { O2Rings } from '@/components/brand/O2Rings';

const mainNavItems = [
  { to: '/app/dashboard', icon: LayoutDashboard, label: 'Início' },
  { to: '/app/expenses', icon: Receipt, label: 'Despesas' },
  { to: '/app/reports', icon: FileText, label: 'Relatórios' },
  { to: '/app/advances', icon: Wallet, label: 'Adiantamentos' },
];

// Item exclusivo de admin — visibilidade condicionada por useAuth().isAdmin.
const adminNavItem = { to: '/app/gestao', icon: LineChart, label: 'Gestão' };

const secondaryNavItems = [
  { to: '/app/settings/policy', icon: Settings, label: 'Configurações', matchPrefix: '/app/settings' },
  { to: '/app/support', icon: HelpCircle, label: 'Suporte' },
];

export function SidebarNav() {
  const location = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const { isAdmin } = useAuth();
  const isCollapsed = state === 'collapsed';

  // "Gestão" só aparece para admin (backend já bloqueia a RPC de não-admins).
  const navItems = isAdmin ? [...mainNavItems, adminNavItem] : mainNavItems;

  const isActive = (to: string, matchPrefix?: string) => {
    if (matchPrefix) {
      return location.pathname.startsWith(matchPrefix);
    }
    return location.pathname === to;
  };

  return (
    <Sidebar collapsible="icon">
      {/* Marca O2 — anéis + wordmark condensado */}
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <div className="flex h-10 items-center gap-2.5">
          <O2Rings size={26} className="shrink-0" />
          {!isCollapsed && (
            <span className="font-display text-xl uppercase leading-none tracking-wide text-sidebar-foreground">
              Oxy VE
            </span>
          )}
        </div>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.to)}
                    tooltip={item.label}
                  >
                    <NavLink
                      to={item.to}
                      className={cn(
                        "font-sans transition-colors duration-150",
                        isActive(item.to) && "border-l-2 border-sidebar-primary font-medium text-sidebar-primary"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryNavItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.to, item.matchPrefix)}
                    tooltip={item.label}
                  >
                    <NavLink
                      to={item.to}
                      className={cn(
                        "font-sans transition-colors duration-150",
                        isActive(item.to, item.matchPrefix) && "border-l-2 border-sidebar-primary font-medium text-sidebar-primary"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer with collapse toggle */}
      <SidebarFooter className="border-t border-sidebar-border">
        <div className={cn(
          "flex items-center",
          isCollapsed ? "justify-center" : "justify-between px-2"
        )}>
          {!isCollapsed && (
            <p className="o2-eyebrow text-sidebar-foreground/45">
              © 2026 Oxy VE
            </p>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onClick={toggleSidebar}
              >
                <ChevronsLeft className={cn(
                  "h-4 w-4 transition-transform",
                  isCollapsed && "rotate-180"
                )} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isCollapsed ? 'Expandir menu' : 'Recolher menu'}
            </TooltipContent>
          </Tooltip>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
