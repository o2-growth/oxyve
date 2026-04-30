import { useEffect, useState } from 'react';

/**
 * Hook utilitário para detectar viewport mobile baseado em breakpoint.
 * Por padrão usa 1024px (Tailwind `lg`), batendo com a regra do BottomNav
 * (`block lg:hidden`). Para o breakpoint legado `md` (768px), use
 * `@/hooks/use-mobile`.
 */
export function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);

  return isMobile;
}
