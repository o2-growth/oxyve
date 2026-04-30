import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

// Sprint 4 — banner amarelo no topo quando o navegador detecta offline.
// Listen window 'online' / 'offline'. Inicializa com navigator.onLine.
export function OfflineBanner() {
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-yellow-300 bg-yellow-100 px-4 py-2 text-xs text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>Sem conexão. Suas alterações serão sincronizadas quando voltar online.</span>
    </div>
  );
}
