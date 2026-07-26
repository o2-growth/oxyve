import { O2Rings } from './O2Rings';
import { cn } from '@/lib/utils';

interface O2LogoProps {
  size?: number;
  className?: string;
  monochrome?: boolean;
}

/**
 * Lockup da marca O2 Inc. — anéis O2 + logotipo textual.
 * Usa o componente O2Rings em vez de imagem raster para garantir proporção
 * correta em qualquer tamanho de tela e evitar distorção.
 */
export function O2Logo({ size = 32, className, monochrome = false }: O2LogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <O2Rings size={size} className={monochrome ? 'text-foreground' : undefined} />
      <span
        className="text-foreground"
        style={{
          fontFamily: "'Barlow Condensed', 'Anton', 'Montserrat', sans-serif",
          fontSize: size * 0.75,
          fontWeight: 700,
          letterSpacing: '0.04em',
          lineHeight: 1,
        }}
      >
        O2 INC.
      </span>
    </div>
  );
}
