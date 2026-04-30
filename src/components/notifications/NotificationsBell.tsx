/**
 * Sprint 2 — GAP-G012: sino de notificações no header.
 *
 * Tabs internas: Todas / Ações necessárias / Minhas despesas / Outras
 * (igual VExpenses screens 03b).
 */
import { Bell, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useNotifications,
  useUnreadNotificationsCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  NotificationCategory,
  NotificationRow,
} from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

interface NotificationItemProps {
  n: NotificationRow;
  onClick: (n: NotificationRow) => void;
}

function NotificationItem({ n, onClick }: NotificationItemProps) {
  const isUnread = !n.read_at;
  return (
    <button
      type="button"
      onClick={() => onClick(n)}
      className={cn(
        'w-full text-left rounded-md border p-3 transition-colors hover:bg-accent',
        isUnread ? 'bg-primary/5 border-primary/20' : 'bg-card'
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-1 inline-block h-2 w-2 shrink-0 rounded-full',
            isUnread ? 'bg-primary' : 'bg-transparent'
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug truncate">{n.title}</p>
          {n.body && (
            <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">
            {format(parseISO(n.created_at), "dd MMM 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
      </div>
    </button>
  );
}

const CATEGORIES: { value: NotificationCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'action_required', label: 'Ações' },
  { value: 'my_expenses', label: 'Despesas' },
  { value: 'other', label: 'Outras' },
];

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<NotificationCategory | 'all'>('all');
  const navigate = useNavigate();

  const { data: all, isLoading } = useNotifications({ limit: 30 });
  const unreadCount = useUnreadNotificationsCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const filtered = (all || []).filter((n) => {
    if (tab === 'all') return true;
    return n.category === tab;
  });

  const handleClick = async (n: NotificationRow) => {
    if (!n.read_at) {
      try {
        await markRead.mutateAsync(n.id);
      } catch {
        // ignore — UI se atualiza no próximo refetch.
      }
    }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b p-3">
          <p className="text-sm font-semibold">Notificações</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-3 w-3" />
              Marcar todas
            </Button>
          )}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as NotificationCategory | 'all')}>
          <TabsList className="grid w-full grid-cols-4 rounded-none border-b bg-transparent p-0">
            {CATEGORIES.map((c) => (
              <TabsTrigger
                key={c.value}
                value={c.value}
                className="rounded-none text-xs data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
              >
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={tab} className="m-0">
            <ScrollArea className="h-[360px] p-2">
              {isLoading ? (
                <div className="space-y-2 p-1">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex h-32 items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    Nenhuma notificação por aqui.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 p-1">
                  {filtered.map((n) => (
                    <NotificationItem key={n.id} n={n} onClick={handleClick} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
