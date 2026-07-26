import * as React from "react";

/**
 * Ponto de corte único do app: alinhado ao `lg:` do Tailwind.
 *
 * < 1024px  → mundo mobile (BottomNav + MoreSheet, sem sidebar)
 * ≥ 1024px  → mundo desktop (SidebarNav)
 *
 * Antes o hook cortava em 768 enquanto a BottomNav/SidebarTrigger cortavam
 * em `lg:` (1024) — a faixa tablet (768–1023) mostrava rail + bottom nav ao
 * mesmo tempo. Unificar em 1024 elimina a navegação dupla.
 */
const MOBILE_BREAKPOINT = 1024;

export function useIsMobile() {
  // Inicialização síncrona a partir da largura real — sem "flash" de layout
  // desktop no primeiro paint em telas pequenas (app é client-only/Vite).
  const [isMobile, setIsMobile] = React.useState<boolean>(() =>
    typeof window !== "undefined"
      ? window.innerWidth < MOBILE_BREAKPOINT
      : false,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
