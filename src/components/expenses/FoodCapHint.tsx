import { formatCurrency, foodCapLabel, parseAmountToCents } from '@/lib/constants';
import type { FoodCap } from '@/hooks/useFoodCapAmount';
import { READ_WARN_TEXT } from './readingWarning';

/**
 * Abaixo do campo Valor de alimentação: o valor da nota como referência e, se a
 * pessoa subir o lançado acima do teto, o aviso de que o reembolso para no teto.
 */
export function FoodCapHint({ cap, amount }: { cap: FoodCap; amount: string }) {
  if (!cap.active) return null;
  const parsed = parseAmountToCents(amount || '');
  const field = Number.isNaN(parsed) ? 0 : parsed;
  const note = cap.noteCents;
  const label = foodCapLabel(cap.dailyLimitCents, cap.days);
  const showNote = note != null && (note > cap.capCents || field !== note);
  const capped = note != null && note > cap.capCents && field === cap.capCents;
  return (
    <>
      {showNote && (
        <p className="text-xs text-muted-foreground" data-testid="food-cap-note">
          Nota: <span className="o2-num">{formatCurrency(note)}</span>
          {capped && <> · lançado até o teto de {label}. Você pode alterar.</>}
        </p>
      )}
      {field > cap.capCents && (
        <p className={READ_WARN_TEXT} data-testid="food-cap-over">
          Acima do teto: será reembolsado até {label}
        </p>
      )}
    </>
  );
}
