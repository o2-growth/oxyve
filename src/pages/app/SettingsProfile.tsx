import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
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
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, User } from 'lucide-react';

const formSchema = z.object({
  full_name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('Email inválido'),
});

type FormData = z.infer<typeof formSchema>;

export default function SettingsProfile() {
  const { user, profile, refreshProfile } = useAuth();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      full_name: '',
      email: '',
    },
  });

  useEffect(() => {
    if (profile && user) {
      form.reset({
        full_name: profile.full_name || '',
        email: user.email || '',
      });
    }
  }, [profile, user, form]);

  const updateProfile = useMutation({
    mutationFn: async (data: FormData) => {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: data.full_name })
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

  return (
    <AppShell>
      <SettingsLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Meus Dados</h1>
            <p className="text-muted-foreground">
              Gerencie suas informações pessoais
            </p>
          </div>

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
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="full_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome completo</FormLabel>
                        <FormControl>
                          <Input placeholder="Seu nome" {...field} />
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
                          <Input {...field} disabled />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="pt-4">
                    <Button type="submit" disabled={updateProfile.isPending}>
                      {updateProfile.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Salvar Alterações
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </SettingsLayout>
    </AppShell>
  );
}
