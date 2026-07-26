/**
 * O2Rings — o símbolo da marca O2 (anéis concêntricos verde-lima).
 * Direção do Fable: é o herói do login E o spinner oficial do app inteiro
 * (nunca usar spinner genérico). Suporta respiração, rotação e wireframe.
 *
 * - breathing: pulso lento (login, FAB, hero)
 * - spinning: os anéis finos giram em sentidos opostos (loading / submit)
 * - wireframe: stroke apagado sem verde (empty states editoriais)
 */
import { cn } from '@/lib/utils';

interface O2RingsProps {
  size?: number;
  className?: string;
  breathing?: boolean;
  spinning?: boolean;
  /** Rotação mais rápida — usado como loading/submit. */
  fast?: boolean;
  /** Sem verde, stroke muted — para empty states. */
  wireframe?: boolean;
}

export function O2Rings({
  size = 96,
  className,
  breathing = false,
  spinning = false,
  fast = false,
  wireframe = false,
}: O2RingsProps) {
  const color = wireframe ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary))';
  const spinOuter = spinning
    ? { animation: `o2-spin-slow ${fast ? 2.4 : 90}s linear infinite` }
    : undefined;
  const spinInner = spinning
    ? { animation: `o2-spin-rev ${fast ? 1.8 : 70}s linear infinite` }
    : undefined;

  return (
    <span
      className={cn('inline-grid place-items-center', breathing && 'o2-breathe-wrap', className)}
      style={{
        width: size,
        height: size,
        color,
        ...(breathing ? { animation: 'o2-breathe 4.4s cubic-bezier(0.2,0.8,0.2,1) infinite' } : {}),
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" width={size} height={size} fill="none" style={{ display: 'block' }}>
        {/* Anéis sólidos — o símbolo do logo */}
        <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="7" opacity={wireframe ? 0.5 : 1} />
        <circle cx="50" cy="50" r="23" stroke="currentColor" strokeWidth="7" opacity={wireframe ? 0.5 : 1} />
        {/* Anéis finos tracejados — decoração que gira */}
        <g style={spinOuter} transform-origin="50 50">
          <circle cx="50" cy="50" r="47" stroke="currentColor" strokeWidth="1" strokeDasharray="1 6" opacity="0.45" />
        </g>
        <g style={spinInner} transform-origin="50 50">
          <circle cx="50" cy="50" r="31" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 7" opacity="0.55" />
        </g>
      </svg>
    </span>
  );
}

/**
 * O2Spinner — atalho para o loading padrão do app (anéis girando).
 */
export function O2Spinner({ size = 40, className }: { size?: number; className?: string }) {
  return <O2Rings size={size} spinning fast className={className} />;
}
