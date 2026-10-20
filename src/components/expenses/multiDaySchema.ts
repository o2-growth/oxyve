import { z } from 'zod';
import { amountFieldError, endOfToday, minExpenseDate, MAX_EXPENSE_AGE_DAYS } from '@/lib/constants';

// Schema do lançamento de vários dias (separado para teste). Valor pelo mesmo parser do
// formulário avulso: parseFloat lia "1.200" (hospedagem) como R$ 1,20 por dia, sem aviso.
export const multiDaySchema = z
  .object({
    category_id: z.string().min(1, 'Escolha a categoria'),
    start_date: z.date({ required_error: 'Data inicial obrigatória' }),
    end_date: z.date({ required_error: 'Data final obrigatória' }),
    amount_per_day: z
      .string()
      .min(1, 'Informe o valor por dia')
      .refine((v) => !amountFieldError(v), (v) => ({ message: amountFieldError(v) ?? '' })),
    description: z.string().min(1, 'Descrição obrigatória'),
    is_event: z.boolean(),
    notes: z.string().optional(),
  })
  .refine((d) => d.end_date >= d.start_date, {
    message: 'A data final deve ser igual ou posterior à inicial',
    path: ['end_date'],
  })
  // Evento (libera o teto diário) exige justificativa escrita.
  .superRefine((d, ctx) => {
    // Mesma janela do gatilho do banco: fora dela a RPC (atômica) recusava o lote inteiro.
    if (d.start_date < minExpenseDate()) {
      ctx.addIssue({
        path: ['start_date'],
        code: z.ZodIssueCode.custom,
        message: `Só dá para lançar despesas de até ${MAX_EXPENSE_AGE_DAYS} dias atrás`,
      });
    }
    if (d.end_date > endOfToday()) {
      ctx.addIssue({
        path: ['end_date'],
        code: z.ZodIssueCode.custom,
        message: 'A data final não pode ser no futuro',
      });
    }
    if (d.is_event && (!d.notes || d.notes.trim().length < 3)) {
      ctx.addIssue({
        path: ['notes'],
        code: z.ZodIssueCode.custom,
        message: 'Descreva o motivo da exceção de evento.',
      });
    }
  });
