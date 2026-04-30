import { useEffect } from "react";
import { toast } from "sonner";
// virtual:pwa-register/react é provido pelo vite-plugin-pwa em build prod.
// Em dev (devOptions.enabled = false) o módulo ainda é resolvido como stub.
import { useRegisterSW } from "virtual:pwa-register/react";

// Sprint 4 — toast Sonner avisando "nova versão disponível".
// O plugin tem registerType "autoUpdate", que rerregistra o SW em cada deploy.
// Ainda assim, mostramos prompt explícito porque skipWaiting=false: o usuário
// decide quando aplicar a atualização (evita perder formulário aberto).
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl) {
      if (import.meta.env.DEV) {
        console.info("[pwa] sw registered:", swUrl);
      }
    },
    onRegisterError(error) {
      console.error("[pwa] sw register error", error);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    const id = toast("Nova versão disponível", {
      description: "Atualize agora pra carregar as últimas melhorias.",
      duration: Infinity,
      action: {
        label: "Atualizar",
        onClick: () => {
          void updateServiceWorker(true);
        },
      },
      cancel: {
        label: "Depois",
        onClick: () => setNeedRefresh(false),
      },
    });
    return () => {
      toast.dismiss(id);
    };
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}
