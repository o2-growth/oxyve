import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Share2, X } from "lucide-react";

// Sprint 4 — banner de instalação PWA.
// Funciona em duas vias:
//  1) Browsers Chromium / Edge / Android: escutam `beforeinstallprompt`
//     e disparam o prompt nativo via event.prompt().
//  2) iOS Safari: não tem `beforeinstallprompt`. Detectamos UA + standalone
//     e mostramos instrução manual ("Compartilhar → Adicionar à Tela").
//
// Dismiss persiste 7 dias em localStorage.

const DISMISS_KEY = "pwa-dismissed-at";
const DISMISS_DAYS = 7;

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari coloca window.navigator.standalone = true quando rodando como PWA.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // iPad em iPadOS 13+ reporta como Mac; checamos touch points.
  const isIpadOS =
    /Mac/.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || isIpadOS;
}

function isRecentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
    return ageDays < DISMISS_DAYS;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (isRecentlyDismissed()) return;

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setHidden(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // iOS: sem evento nativo. Mostra banner com instrução depois de 1.5s
    // (evita flash logo no load).
    let iosTimer: ReturnType<typeof setTimeout> | null = null;
    if (isIos()) {
      iosTimer = setTimeout(() => {
        setShowIosHint(true);
        setHidden(false);
      }, 1500);
    }

    const handleInstalled = () => {
      setDeferredPrompt(null);
      setShowIosHint(false);
      setHidden(true);
    };
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "dismissed") {
        try {
          localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } catch {
          /* storage indisponível, segue */
        }
      }
    } finally {
      setDeferredPrompt(null);
      setHidden(true);
    }
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* noop */
    }
    setHidden(true);
    setDeferredPrompt(null);
    setShowIosHint(false);
  };

  if (hidden) return null;
  if (!deferredPrompt && !showIosHint) return null;

  return (
    <div
      role="dialog"
      aria-label="Instalar Oxy VE"
      className="fixed inset-x-0 bottom-0 z-50 mx-auto mb-[calc(6.5rem+env(safe-area-inset-bottom))] w-[calc(100%-2rem)] max-w-md rounded-lg border bg-background p-4 shadow-lg lg:mb-6"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          {showIosHint ? <Share2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium">Instalar Oxy VE como app</p>
          {showIosHint ? (
            <p className="text-xs text-muted-foreground">
              Toque em <span className="font-medium">Compartilhar</span> e depois em{" "}
              <span className="font-medium">Adicionar à Tela de Início</span>.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Acesso rápido pra lançar despesas e fotografar recibos direto da tela inicial.
            </p>
          )}
          <div className="flex items-center gap-2 pt-2">
            {!showIosHint && deferredPrompt && (
              <Button size="sm" onClick={handleInstall}>
                Instalar
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={handleDismiss}>
              Mais tarde
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Fechar"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
