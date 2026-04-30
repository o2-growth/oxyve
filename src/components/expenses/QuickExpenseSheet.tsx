/**
 * Sprint 5 — Stub.
 *
 * TODO Sprint 6: Implementar fluxo "camera-first" de despesa rápida.
 *  - FAB no Dashboard/Expenses dispara este sheet.
 *  - Captura foto do recibo direto via `<input type="file" accept="image/*" capture="environment" />`.
 *  - OCR/validação roda em background (`useValidateReceipt`) enquanto o
 *    usuário preenche valor + categoria mínimos.
 *  - Submit cria a despesa "loose" (sem report) e fecha o sheet.
 *
 * Por hora exporta apenas o wrapper Drawer com props pra parent já poder
 * importar sem quebrar build, e marca o lugar onde o conteúdo entra.
 */
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

export interface QuickExpenseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Callback após criar despesa (pra refresh local). */
  onCreated?: () => void;
}

export function QuickExpenseSheet({ open, onOpenChange }: QuickExpenseSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Despesa rápida</DrawerTitle>
        </DrawerHeader>
        {/* TODO Sprint 6: camera-first form aqui. */}
        <div className="p-4 text-sm text-muted-foreground">
          Em breve. Captura por câmera e OCR chegam no Sprint 6.
        </div>
      </DrawerContent>
    </Drawer>
  );
}
