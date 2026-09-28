import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// No celular (< lg, onde existe a BottomNav) o aviso desce do topo, logo abaixo da
// TopBar (h-14), para não cobrir a barra inferior nem o botão de captura.
// No desktop fica embaixo à direita.
const MOBILE_TOP_OFFSET = "calc(env(safe-area-inset-top, 0px) + 64px)";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const isMobile = useIsMobile();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position={isMobile ? "top-center" : "bottom-right"}
      offset={isMobile ? MOBILE_TOP_OFFSET : undefined}
      mobileOffset={isMobile ? { top: MOBILE_TOP_OFFSET, left: 16, right: 16 } : undefined}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
