import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { cpf, cnpj } from 'cpf-cnpj-validator';
import { AppShell } from '@/components/layout/AppShell';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useAuth, type PixKeyType } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, User } from 'lucide-react';

// GAP-G022: validação CPF / CNPJ por módulo 11 (lib `cpf-cnpj-validator`).
const optionalDigits = z
  .string()
  .optional()
  .transform((v) => (v ? v.replace(/\D/g, '') : ''))
  .refine(
    (v) => v === '' || cpf.isValid(v) || cnpj.isValid(v),
    { message: 'CPF ou CNPJ inválido' }
  );

const pixKeyTypes = ['cpf', 'cnpj', 'email', 'phone', 'random'] as const satisfies readonly PixKeyType[];

// GAP-G021: PIX é validado conforme o tipo selecionado.
function isValidPix(value: string, type: PixKeyType | undefined | ''): boolean {
  if (!value) return true; // campo é opcional
  if (!type) return false;
  switch (type) {
    case 'cpf':
      return cpf.isValid(value.replace(/\D/g, ''));
    case 'cnpj':
      return cnpj.isValid(value.replace(/\D/g, ''));
    case 'email':
      return /.+@.+\..+/.test(value);
    case 'phone':
      return /^\+?\d{10,15}$/.test(value.replace(/\D/g, ''));
    case 'random':
      // chave aleatória PIX = UUID v4 (formato canônico)
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    default:
      return false;
  }
}

const formSchema = z
  .object({
    full_name: z.string().min(1, 'Nome é obrigatório'),
    email: z.string().email('Email inválido'),
    cpf_cnpj: optionalDigits,
    bank_name: z.string().optional().or(z.literal('')),
    bank_branch: z.string().optional().or(z.literal('')),
    bank_account: z.string().optional().or(z.literal('')),
    pix_key_type: z.enum(pixKeyTypes).optional().or(z.literal('')),
    pix_key: z.string().optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    // PIX exige tipo + valor consistente.
    if (data.pix_key && !data.pix_key_type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pix_key_type'],
        message: 'Selecione o tipo da chave PIX',
      });
    }
    if (data.pix_key && data.pix_key_type) {
      const ok = isValidPix(data.pix_key, data.pix_key_type as PixKeyType);
      if (!ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pix_key'],
          message: 'Chave PIX inválida para o tipo selecionado',
        });
      }
    }
  });

type FormData = z.infer<typeof formSchema>;

export default function SettingsProfile() {
  const { user, profile, refreshProfile } = useAuth();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      full_name: '',
      email: '',
      cpf_cnpj: '',
      bank_name: '',
      bank_branch: '',
      bank_account: '',
      pix_key_type: '',
      pix_key: '',
    },
  });

  useEffect(() => {
    if (profile && user) {
      form.reset({
        full_name: profile.full_name || '',
        email: user.email || '',
        cpf_cnpj: profile.cpf_cnpj || '',
        bank_name: profile.bank_name || '',
        bank_branch: profile.bank_branch || '',
        bank_account: profile.bank_account || '',
        pix_key_type: (profile.pix_key_type as PixKeyType | null) || '',
        pix_key: profile.pix_key || '',
      });
    }
  }, [profile, user, form]);

  const updateProfile = useMutation({
    mutationFn: async (data: FormData) => {
      // Cast: types gerados ainda não incluem novos campos (Aria-6 pendente).
      // No runtime o Postgres aceita normalmente após migration aplicada.
      const payload: Record<string, unknown> = {
        full_name: data.full_name,
        cpf_cnpj: data.cpf_cnpj || null,
        bank_name: data.bank_name || null,
        bank_branch: data.bank_branch || null,
        bank_account: data.bank_account || null,
        pix_key: data.pix_key || null,
        pix_key_type: data.pix_key_type ? data.pix_key_type : null,
      };
      const { error } = await supabase
        .from('profiles')
        .update(payload as never)
        .eq('id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      refreshProfile();
      toast.success('Perfil atualizado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar perfil: ' + error.message);
    },
  });

  const onSubmit = (data: FormData) => {
    updateProfile.mutate(data);
  };

  const pixTypeOptions = useMemo(
    () => [
      { value: 'cpf', label: 'CPF' },
      { value: 'cnpj', label: 'CNPJ' },
      { value: 'email', label: 'Email' },
      { value: 'phone', label: 'Telefone' },
      { value: 'random', label: 'Chave aleatória' },
    ],
    []
  );

  return (
    <AppShell>
      <SettingsLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Meus Dados</h1>
            <p className="text-muted-foreground">
              Gerencie suas informações pessoais e de pagamento
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card className="max-w-2xl">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <User className="h-8 w-8" />
                    </div>
                    <div>
                      <CardTitle>{profile?.full_name || 'Usuário'}</CardTitle>
                      <CardDescription>{user?.email}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="full_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome completo</FormLabel>
                        <FormControl>
                          <Input placeholder="Seu nome" className="h-12 lg:h-10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input className="h-12 lg:h-10" {...field} disabled />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cpf_cnpj"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CPF / CNPJ</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Apenas números"
                            inputMode="numeric"
                            className="h-12 lg:h-10"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* GAP-G021: dados bancários */}
              <Card className="max-w-2xl">
                <CardHeader>
                  <CardTitle>Dados bancários</CardTitle>
                  <CardDescription>
                    Usado para reembolsos. Preenchimento opcional.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="bank_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Banco</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex.: Itaú" className="h-12 lg:h-10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="bank_branch"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Agência</FormLabel>
                          <FormControl>
                            <Input placeholder="0000" className="h-12 lg:h-10" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bank_account"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Conta</FormLabel>
                          <FormControl>
                            <Input placeholder="00000-0" className="h-12 lg:h-10" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="pix_key_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo da chave PIX</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || ''}
                          >
                            <FormControl>
                              <SelectTrigger className="h-12 lg:h-10">
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {pixTypeOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="pix_key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Chave PIX</FormLabel>
                          <FormControl>
                            <Input placeholder="Sua chave" className="h-12 lg:h-10" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="max-w-2xl">
                <Button
                  type="submit"
                  disabled={updateProfile.isPending}
                  className="w-full h-12 lg:w-auto lg:h-10"
                >
                  {updateProfile.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Salvar alterações
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </SettingsLayout>
    </AppShell>
  );
}
