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
  // Reprovação é total e devolve o relatório como rascunho ao autor.
  rejected: 'Devolvido ao autor',
  paid: 'Pago',
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
    default: return <HistoryIcon className="h-4 w-4 text-muted-foreground" />;
  }
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  submitted: 'Em aprovação',
  approved: 'Aprovado',
  rejected: 'Devolvido',
  paid: 'Pago',
};

/** Detalhe legível do evento (antes era o JSON cru). */
function eventDetail(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  const parts: string[] = [];
  const from = typeof data.from === 'string' ? data.from : null;
  const to = typeof data.to === 'string' ? data.to : null;
  if (from && to) parts.push(`${STATUS_LABEL[from] ?? from} → ${STATUS_LABEL[to] ?? to}`);
  const comment = typeof data.comment === 'string' ? data.comment.trim() : '';
  if (comment) parts.push(`Motivo: ${comment}`);
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (description) parts.push(description);
  return parts.length ? parts.join(' • ') : null;
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
                  {eventDetail(event.data) && (
                    <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {eventDetail(event.data)}
                    </p>
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
