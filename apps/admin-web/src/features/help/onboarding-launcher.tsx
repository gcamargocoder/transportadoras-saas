'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/use-auth';
import { OnboardingModal } from './onboarding-modal';
import { isOnboardingDismissed, setOnboardingDismissed } from './onboarding-storage';

// Parte 9 do pedido -- primeiro acesso: mostra a introdução automaticamente
// na primeira vez que este usuário entra (ver onboarding-storage.ts para a
// decisão de persistência). Montado uma vez no AppShell -- nunca em cada
// página individualmente.
export function OnboardingLauncher(): JSX.Element | null {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!isOnboardingDismissed(user.tenantId, user.id)) setOpen(true);
  }, [user]);

  if (!user) return null;

  return (
    <OnboardingModal
      open={open}
      onDismiss={() => {
        setOnboardingDismissed(user.tenantId, user.id);
        setOpen(false);
      }}
    />
  );
}
