import * as React from "react";

// Corte único mobile↔desktop = 1024px (Tailwind `lg`). Bate com o CSS da casca
// (BottomNav `lg:hidden`, sidebar montada só em lg+, `main` com `lg:` padding).
// Antes era 768 e brigava com o CSS, criando a zona morta 768–1023 onde sidebar
// e bottom nav apareciam juntas. iPad em retrato (768–834) passa a ganhar a
// experiência de polegar — correta para captura de recibo.
const MOBILE_BREAKPOINT = 1024;

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

export function useIsMobile() {
  // Lazy initializer lê o match no 1º render — mata o flash onde `isMobile`
  // chegava `false` no celular e a sidebar piscava antes do efeito corrigir.
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(QUERY).matches;
  });

  React.useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
