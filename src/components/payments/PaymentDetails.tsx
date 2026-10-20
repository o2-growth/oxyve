import { AlertTriangle, Copy, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { PixKeyType } from '@/contexts/AuthContext';

/** Dados de pagamento de quem recebe (colunas de profiles). */
export interface PaymentInfo {
  pix_key?: string | null;
  pix_key_type?: PixKeyType | string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account?: string | null;
}

const PIX_TYPE_LABEL: Record<string, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  phone: 'Telefone',
  random: 'Chave aleatória',
};

/**
 * Para onde vai o dinheiro: o admin confere PIX e banco de quem recebe na hora de
 * pagar, sem sair da tela (antes precisava abrir o cadastro da pessoa). Usado no
 * pagamento por pessoa (Gestão) e por relatório (Detalhe).
 */
export function PaymentDetails({ person }: { person: PaymentInfo | null | undefined }) {
  const pix = person?.pix_key?.trim() || '';
  const bankParts = [
    person?.bank_name?.trim(),
    person?.bank_branch?.trim() ? `Ag. ${person.bank_branch.trim()}` : '',
    person?.bank_account?.trim() ? `Conta ${person.bank_account.trim()}` : '',
  ].filter(Boolean);

  const copyPix = async () => {
    try {
      await navigator.clipboard.writeText(pix);
      toast.success('Chave PIX copiada!');
    } catch {
      // Sem permissão de área de transferência (ex.: http, navegador antigo).
      toast.error('Não foi possível copiar. Selecione a chave e copie manualmente.');
    }
  };

  if (!pix && bankParts.length === 0) {
    return (
      <p
        className="flex items-center gap-1.5 rounded-lg border border-[hsl(var(--status-event)/0.5)] p-3 text-sm text-muted-foreground"
        data-testid="payment-details"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Pessoa sem dados de pagamento cadastrados.
      </p>
    );
  }

  return (
    <div className="space-y-1.5 rounded-lg border p-3 text-sm" data-testid="payment-details">
      <p className="o2-eyebrow flex items-center gap-1.5">
        <Landmark className="h-3.5 w-3.5" />
        Dados de pagamento
      </p>
      {pix && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 [overflow-wrap:anywhere]">
            <span className="text-muted-foreground">
              PIX{person?.pix_key_type ? ` (${PIX_TYPE_LABEL[person.pix_key_type] ?? person.pix_key_type})` : ''}:
            </span>{' '}
            <span className="o2-num font-medium">{pix}</span>
          </p>
          <Button variant="outline" size="sm" className="h-9 gap-1" onClick={copyPix}>
            <Copy className="h-3.5 w-3.5" />
            Copiar chave PIX
          </Button>
        </div>
      )}
      {bankParts.length > 0 && (
        <p className="o2-num text-muted-foreground">{bankParts.join(' · ')}</p>
      )}
    </div>
  );
}
