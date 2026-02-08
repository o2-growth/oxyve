import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useReports, useCreateReport, useAddExpenseToReport } from '@/hooks/useReports';
import { Expense } from '@/hooks/useExpenses';
import { Loader2, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';

interface AddToReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
}

export function AddToReportDialog({
  open,
  onOpenChange,
  expense,
}: AddToReportDialogProps) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedReportId, setSelectedReportId] = useState<string>('');
  const [newReportTitle, setNewReportTitle] = useState('');

  const { data: reports, isLoading: reportsLoading } = useReports({ status: 'draft' });
  const createReport = useCreateReport();
  const addExpenseToReport = useAddExpenseToReport();

  const isLoading = createReport.isPending || addExpenseToReport.isPending;

  const handleSubmit = async () => {
    if (!expense) return;

    let reportId = selectedReportId;

    if (mode === 'new') {
      if (!newReportTitle.trim()) return;
      const newReport = await createReport.mutateAsync({ title: newReportTitle });
      reportId = newReport.id;
    }

    if (!reportId) return;

    await addExpenseToReport.mutateAsync({
      reportId,
      expenseId: expense.id,
    });

    onOpenChange(false);
    setMode('existing');
    setSelectedReportId('');
    setNewReportTitle('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar a Relatório</DialogTitle>
          <DialogDescription>
            Escolha um relatório existente ou crie um novo para adicionar esta despesa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as 'existing' | 'new')}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="existing" id="existing" />
              <Label htmlFor="existing">Relatório existente</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="new" id="new" />
              <Label htmlFor="new">Criar novo relatório</Label>
            </div>
          </RadioGroup>

          {mode === 'existing' && (
            <div className="space-y-2">
              {reportsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : reports?.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum relatório em rascunho. Crie um novo.
                </p>
              ) : (
                <RadioGroup
                  value={selectedReportId}
                  onValueChange={setSelectedReportId}
                  className="space-y-2"
                >
                  {reports?.map((report) => (
                    <div
                      key={report.id}
                      className="flex items-center space-x-3 rounded-lg border p-3"
                    >
                      <RadioGroupItem value={report.id} id={report.id} />
                      <Label htmlFor={report.id} className="flex-1 cursor-pointer">
                        <p className="font-medium">{report.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {report.expense_count} despesa(s) •{' '}
                          {formatCurrency(report.total_cents || 0)}
                        </p>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            </div>
          )}

          {mode === 'new' && (
            <div className="space-y-2">
              <Label htmlFor="title">Título do relatório</Label>
              <Input
                id="title"
                placeholder="Ex: Viagem São Paulo - Janeiro"
                value={newReportTitle}
                onChange={(e) => setNewReportTitle(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                isLoading ||
                (mode === 'existing' && !selectedReportId) ||
                (mode === 'new' && !newReportTitle.trim())
              }
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'new' ? (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Criar e Adicionar
                </>
              ) : (
                'Adicionar'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
