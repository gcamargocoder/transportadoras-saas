'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, LogIn, Mail, Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../hooks/use-auth';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { toFriendlyMessage } from '../../lib/api/errors';
import { loginSchema, type LoginFormValues } from '../../features/auth/login-schema';

export default function LoginPage(): JSX.Element {
  const { status, login } = useAuth();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  async function onSubmit(values: LoginFormValues) {
    setFormError(null);
    try {
      await login(values);
      router.replace('/dashboard');
    } catch (error) {
      setFormError(toFriendlyMessage(error) ?? 'Nao foi possivel autenticar.');
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 flex-col justify-between bg-brand-700 px-12 py-10 text-white lg:flex">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/15">
            <Truck size={18} />
          </span>
          <span className="text-lg font-semibold">Transportadoras SaaS</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Gestão completa da sua operação de transporte
          </h2>
          <p className="mt-4 text-sm text-brand-100">
            Viagens, frota, pedágios, abastecimentos e financeiro em um só lugar — com dados em
            tempo real direto da sua base operacional.
          </p>
        </div>
        <p className="text-xs text-brand-200">© {new Date().getFullYear()} Transportadoras SaaS</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-600 text-white">
              <Truck size={18} />
            </span>
            <span className="text-lg font-semibold text-ink">Transportadoras SaaS</span>
          </div>

          <h1 className="text-xl font-semibold tracking-tight text-ink">Entrar</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Acesse o painel administrativo da sua empresa.
          </p>

          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <FormField
              label="Identificador da empresa (tenant ID)"
              htmlFor="tenantId"
              required
              error={errors.tenantId?.message}
              hint="UUID fornecido pelo administrador da sua transportadora no cadastro."
            >
              <Input
                id="tenantId"
                placeholder="00000000-0000-0000-0000-000000000000"
                autoComplete="off"
                invalid={Boolean(errors.tenantId)}
                {...register('tenantId')}
              />
            </FormField>

            <FormField label="E-mail" htmlFor="email" required error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                placeholder="usuario@empresa.com.br"
                autoComplete="username"
                leadingIcon={<Mail size={14} />}
                invalid={Boolean(errors.email)}
                {...register('email')}
              />
            </FormField>

            <FormField label="Senha" htmlFor="password" required error={errors.password?.message}>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                leadingIcon={<Lock size={14} />}
                invalid={Boolean(errors.password)}
                {...register('password')}
              />
            </FormField>

            {formError && (
              <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-xs text-danger-700">
                {formError}
              </p>
            )}

            <Button type="submit" size="lg" className="mt-2 justify-center" loading={isSubmitting}>
              <LogIn size={16} />
              Entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
