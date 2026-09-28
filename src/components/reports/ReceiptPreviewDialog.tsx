import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { ExternalLink } from 'lucide-react';

interface ReceiptPreviewDialogProps {
  /** Caminho no bucket `receipts`; null fecha o diálogo. */
  path: string | null;
  title?: string;
  onOpenChange: (open: boolean) => void;
}

const IMAGE_RE = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;
const PDF_RE = /\.pdf$/i;

/**
 * Comprovante aberto na própria tela de aprovação: o gestor confere a nota sem
 * perder o lugar na lista. HEIC e formatos que o navegador não renderiza caem
 * no link "Abrir em nova aba".
 */
export function ReceiptPreviewDialog({ path, title, onOpenChange }: ReceiptPreviewDialogProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setFailed(false);
    if (!path) return;
    supabase.storage
      .from('receipts')
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data?.signedUrl) setFailed(true);
        else setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  const isImage = !!path && IMAGE_RE.test(path);
  const isPdf = !!path && PDF_RE.test(path);

  return (
    <Dialog open={!!path} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comprovante</DialogTitle>
          <DialogDescription className="line-clamp-2 [overflow-wrap:anywhere]">
            {title || 'Comprovante da despesa'}
          </DialogDescription>
        </DialogHeader>

        {failed ? (
          <p className="text-sm text-destructive">Não foi possível abrir o comprovante.</p>
        ) : !url ? (
          <Skeleton className="h-[50vh] w-full" />
        ) : isImage ? (
          <img
            src={url}
            alt={title ? `Comprovante: ${title}` : 'Comprovante'}
            className="mx-auto max-h-[70vh] w-auto rounded-md border object-contain"
          />
        ) : isPdf ? (
          <iframe src={url} title="Comprovante em PDF" className="h-[70vh] w-full rounded-md border" />
        ) : (
          <p className="text-sm text-muted-foreground">
            Este formato não abre aqui. Use o botão abaixo.
          </p>
        )}

        {url && (
          <Button asChild variant="outline" className="h-11 w-full gap-2 sm:w-auto lg:h-10">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Abrir em nova aba
            </a>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
