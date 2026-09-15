'use client';

import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/modal';
import { ONBOARDING_STEPS } from './onboarding-steps';

// Parte 9 do pedido -- onboarding simples: começar, avançar, voltar, pular,
// fechar. Nunca bloqueia o uso do sistema (Parte 10) -- é só um overlay
// dispensável em qualquer momento.
export function OnboardingModal({ open, onDismiss }: { open: boolean; onDismiss: () => void }): JSX.Element | null {
  const [stepIndex, setStepIndex] = useState(0);

  if (!open) return null;

  const step = ONBOARDING_STEPS[stepIndex];
  if (!step) return null;
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;

  function handleClose() {
    setStepIndex(0);
    onDismiss();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={step.title}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Pular
          </Button>
          <Button variant="outline" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => i - 1)}>
            Voltar
          </Button>
          {isLastStep ? (
            <Button onClick={handleClose}>Concluir</Button>
          ) : (
            <Button onClick={() => setStepIndex((i) => i + 1)}>Avançar</Button>
          )}
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-muted">{step.description}</p>
      <p className="mt-4 text-xs text-ink-subtle">
        Passo {stepIndex + 1} de {ONBOARDING_STEPS.length}
      </p>
    </Modal>
  );
}
