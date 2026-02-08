import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { HelpCircle, Mail, MessageSquare } from 'lucide-react';

const faqs = [
  {
    question: 'Como criar uma nova despesa?',
    answer:
      'Acesse a página "Despesas" e clique no botão "Nova Despesa". Preencha as informações da despesa incluindo data, descrição, categoria, valor e forma de pagamento. Você também pode anexar um comprovante.',
  },
  {
    question: 'Como enviar um relatório para aprovação?',
    answer:
      'Primeiro, crie um relatório na página "Relatórios". Depois, adicione despesas ao relatório pela página de despesas (clique nos 3 pontos > "Adicionar a Relatório"). Quando todas as despesas estiverem incluídas, abra o relatório e clique em "Enviar para Aprovação".',
  },
  {
    question: 'O que acontece quando meu relatório é aprovado?',
    answer:
      'Quando seu relatório é aprovado, as despesas incluídas também são marcadas como aprovadas. O financeiro será notificado e processará o reembolso conforme a política da empresa.',
  },
  {
    question: 'Posso editar uma despesa após enviá-la?',
    answer:
      'Despesas com status "Rascunho" podem ser editadas livremente. Após enviar o relatório, as despesas ficam bloqueadas para edição. Se precisar fazer alterações, entre em contato com seu gestor.',
  },
  {
    question: 'Quais tipos de comprovantes posso anexar?',
    answer:
      'Você pode anexar imagens (JPG, PNG) ou documentos PDF dos comprovantes fiscais. Certifique-se de que o documento está legível e contém as informações necessárias como data, valor e CNPJ do estabelecimento.',
  },
];

export default function Support() {
  return (
    <AppShell>
      <PageHeader
        title="Suporte"
        description="Dúvidas frequentes e canais de atendimento"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* FAQ */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                Perguntas Frequentes
              </CardTitle>
              <CardDescription>
                Encontre respostas para as dúvidas mais comuns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="text-left">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>

        {/* Contact */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Contato
              </CardTitle>
              <CardDescription>
                Entre em contato com nossa equipe
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Não encontrou a resposta que procurava? Nossa equipe está
                disponível para ajudar.
              </p>
              <Button className="w-full gap-2">
                <MessageSquare className="h-4 w-4" />
                Abrir Chamado
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                ou envie email para
                <br />
                <a
                  href="mailto:suporte@oxyve.com"
                  className="font-medium text-primary hover:underline"
                >
                  suporte@oxyve.com
                </a>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Horário de Atendimento</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>Segunda a Sexta</p>
              <p className="font-medium text-foreground">08:00 - 18:00</p>
              <p className="mt-2">Fuso horário: Brasília (GMT-3)</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
