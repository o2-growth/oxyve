import { Loader2, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { ValidationStatus } from '@/hooks/useValidateReceipt';

interface ReceiptValidationProps {
  status: ValidationStatus;
  divergences: string[];
  errorMessage: string | null;
}

export function ReceiptValidation({ status, divergences, errorMessage }: ReceiptValidationProps) {
  if (status === 'idle') return null;

  if (status === 'validating') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Analisando comprovante...
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 py-2">
        <CheckCircle2 className="h-4 w-4" />
        Comprovante validado — data e valor conferem
      </div>
    );
  }

  if (status === 'warning') {
    return (
      <div className="rounded-md border border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-950/30 p-3 space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium text-yellow-800 dark:text-yellow-300">
          <AlertTriangle className="h-4 w-4" />
          Divergência encontrada
        </div>
        {divergences.map((d, i) => (
          <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400 pl-6">{d}</p>
        ))}
      </div>
    );
  }

  if (status === 'unavailable') {
    return (
      <div className="rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 p-3">
        <div className="flex items-center gap-2 text-sm text-blue-800 dark:text-blue-300">
          <Info className="h-4 w-4 shrink-0" />
          <span>{errorMessage || 'OCR indisponível no momento. Preencha os dados manualmente.'}</span>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Info className="h-4 w-4" />
        {errorMessage || 'Não foi possível validar automaticamente'}
      </div>
    );
  }

  return null;
}
