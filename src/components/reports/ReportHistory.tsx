/**
 * Sprint 2 — GAP-G011: drawer com timeline de eventos do relatório.
 * Lê `report_events` via useReportEvents hook.
 */
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useReportEvents, ReportEventType } from '@/hooks/useReportEvents';
import {
  CheckCircle2,
  XCircle,
  Send,
  Wallet,
  PlusCircle,
  MinusCircle,
  MessageSquare,
  FilePlus,
  History as HistoryIcon,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ReportHistoryProps {
  reportId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EVENT_LABEL: Record<ReportEventType, string> = {
  created: 'Relatório criado',
  submitted: 'Enviado para aprovação',
  approved: 'Aprovado',
  rejected: 'Reprovado',
  paid: 'Marcado como pago',
  expense_added: 'Despesa adicionada',
  expense_removed: 'Despesa removida',
  comment: 'Comentário',
};

function eventIcon(type: ReportEventType) {
  switch (type) {
    case 'created': return <FilePlus className="h-4 w-4 text-muted-foreground" />;
    case 'submitted': return <Send className="h-4 w-4 text-blue-500" />;
    case 'approved': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'rejected': return <XCircle className="h-4 w-4 text-destructive" />;
    case 'paid': return <Wallet className="h-4 w-4 text-emerald-600" />;
    case 'expense_added': return <PlusCircle className="h-4 w-4 text-primary" />;
    case 'expense_removed': return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
    case 'comment': return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
  }
}

export function ReportHistory({ reportId, open, onOpenChange }: ReportHistoryProps) {
  const { data: events, isLoading } = useReportEvents(reportId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <HistoryIcon className="h-5 w-5" />
            Histórico do relatório
          </SheetTitle>
          <SheetDescription>
            Trilha de auditoria de todos os eventos deste relatório.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="mt-6 h-[calc(100vh-150px)] pr-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !events || events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum evento registrado ainda.
            </p>
          ) : (
            <ol className="relative border-l border-border pl-6 space-y-6">
              {events.map((event) => (
                <li key={event.id} className="relative">
                  <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border bg-card">
                    {eventIcon(event.event_type)}
                  </span>
                  <p className="text-sm font-medium">
                    {EVENT_LABEL[event.event_type] || event.event_type}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {event.actor?.full_name ? `Por ${event.actor.full_name} • ` : ''}
                    {format(parseISO(event.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                  {/* Detalhes JSON minimalistas */}
                  {event.data && Object.keys(event.data).length > 0 && (
                    <pre className="mt-2 rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground overflow-x-auto">
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ol>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
