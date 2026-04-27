import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Receipt,
  FileText,
  Wallet,
  Settings,
  HelpCircle,
  ChevronsLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { useUnreadDecisions } from '@/hooks/useUnreadDecisions';

const mainNavItems = [
  { to: '/app/dashboard', icon: LayoutDashboard, label: 'Início' },
  { to: '/app/expenses', icon: Receipt, label: 'Despesas' },
  { to: '/app/reports', icon: FileText, label: 'Relatórios', badgeKey: 'unreadDecisions' as const },
  { to: '/app/advances', icon: Wallet, label: 'Adiantamentos' },
];

const secondaryNavItems = [
  { to: '/app/settings/policy', icon: Settings, label: 'Configurações', matchPrefix: '/app/settings' },
  { to: '/app/support', icon: HelpCircle, label: 'Suporte' },
];

export function SidebarNav() {
  const location = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const { data: unreadDecisions } = useUnreadDecisions();
  const unreadCount = unreadDecisions?.length ?? 0;

  const isActive = (to: string, matchPrefix?: string) => {
    if (matchPrefix) {
      return location.pathname.startsWith(matchPrefix);
    }
    return location.pathname === to;
  };

  return (
    <Sidebar collapsible="icon">
      {/* Logo */}
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <div className="flex h-10 items-center gap-2">
          {/* O2 Logo Mark */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-sidebar-primary bg-sidebar-background">
            <span className="text-sm font-bold text-sidebar-primary">O2</span>
          </div>
          {!isCollapsed && (
            <span className="text-lg font-semibold text-sidebar-foreground">
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
              {mainNavItems.map((item) => {
                const showBadge = item.badgeKey === 'unreadDecisions' && unreadCount > 0;
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.to)}
                      tooltip={item.label}
                    >
                      <NavLink
                        to={item.to}
                        className={cn(
                          "transition-colors",
                          isActive(item.to) && "border-l-2 border-sidebar-primary"
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        <span className="flex-1">{item.label}</span>
                        {showBadge && (
                          <span
                            aria-label={`${unreadCount} decisão${unreadCount === 1 ? '' : 'ões'} não vista${unreadCount === 1 ? '' : 's'}`}
                            className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground"
                          >
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
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
                        "transition-colors",
                        isActive(item.to, item.matchPrefix) && "border-l-2 border-sidebar-primary"
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
            <p className="text-xs text-sidebar-foreground/50">
              © 2024 Oxy VE
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
