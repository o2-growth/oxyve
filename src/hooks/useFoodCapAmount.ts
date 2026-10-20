import { useCallback, useEffect, useRef, useState } from 'react';
import { foodCapCents, parseAmountToCents } from '@/lib/constants';

/** Centavos → texto do campo Valor ("70,00"). */
export const centsToAmountInput = (cents: number): string => (cents / 100).toFixed(2).replace('.', ',');

interface Options {
  /** Categoria de alimentação e não é evento: o campo vira o valor lançado (até o teto). */
  active: boolean;
  dailyLimitCents: number;
  /** Dias cobertos pela nota (teto = dias × limite diário). */
  days: number;
  setAmount: (value: string) => void;
}

/**
 * Campo Valor de alimentação = valor LANÇADO: menor entre a nota e dias × teto
 * diário. Guarda o valor da nota à parte (referência na tela e na comparação com
 * a leitura do comprovante). Preenche sozinho quando a nota chega (leitura ou
 * digitação + sair do campo), quando a categoria vira alimentação/evento e quando
 * os dias mudam. Edição feita pela pessoa depois disso é respeitada até a nota,
 * a categoria ou os dias mudarem.
 */
export function useFoodCapAmount({ active, dailyLimitCents, days, setAmount }: Options) {
  const [noteCents, setNoteCents] = useState<number | null>(null);
  const noteRef = useRef<number | null>(null);
  // Último valor do campo conhecido pelo hook (escrito por ele ou aceito no blur).
  const lastRef = useRef<number | null>(null);
  const setAmountRef = useRef(setAmount);
  setAmountRef.current = setAmount;

  const capCents = Math.max(1, days || 1) * dailyLimitCents;
  const target = useCallback(
    (note: number) => (active ? foodCapCents(note, dailyLimitCents, days) : note),
    [active, dailyLimitCents, days],
  );

  const write = (cents: number) => {
    lastRef.current = cents;
    setAmountRef.current(centsToAmountInput(cents));
  };

  const setNote = (cents: number | null) => {
    noteRef.current = cents;
    setNoteCents(cents);
  };

  /** Valor da nota vindo da leitura do comprovante: preenche o campo. */
  const applyNote = (cents: number | null | undefined) => {
    if (!cents || cents <= 0) return;
    setNote(cents);
    write(target(cents));
  };

  /** Ao sair do campo (com o texto já normalizado). */
  const onAmountBlur = (raw: string) => {
    if (!raw.trim()) {
      setNote(null);
      lastRef.current = null;
      return;
    }
    const cents = parseAmountToCents(raw);
    if (Number.isNaN(cents) || cents <= 0 || cents === lastRef.current) return;
    if (!active || noteRef.current == null) {
      // Sem teto o campo é a própria nota; com teto e sem nota, o que foi digitado é a nota.
      setNote(cents);
      const next = target(cents);
      if (next !== cents) write(next);
      else lastRef.current = cents;
      return;
    }
    // Já havia nota e o campo foi preenchido sozinho: é a pessoa ajustando o lançado.
    lastRef.current = cents;
  };

  /** Form aberto/recarregado: esquece a nota; `initialCents` é o valor que o campo já tem. */
  const reset = useCallback((initialCents: number | null = null) => {
    noteRef.current = null;
    setNoteCents(null);
    lastRef.current = initialCents;
  }, []);

  // Categoria, evento ou dias mudaram: recalcula a partir da nota (descarta ajuste manual).
  useEffect(() => {
    const note = noteRef.current;
    if (note == null) return;
    const next = target(note);
    lastRef.current = next;
    setAmountRef.current(centsToAmountInput(next));
  }, [target]);

  /** Valor a comparar com a leitura do comprovante: a nota, não o lançado. */
  const referenceCents = useCallback((fieldValue: string): number => {
    if (noteRef.current != null) return noteRef.current;
    const c = parseAmountToCents(fieldValue || '');
    return Number.isNaN(c) ? 0 : c;
  }, []);

  return { noteCents, capCents, active, dailyLimitCents, days: Math.max(1, days || 1), applyNote, onAmountBlur, reset, referenceCents };
}

export type FoodCap = ReturnType<typeof useFoodCapAmount>;
