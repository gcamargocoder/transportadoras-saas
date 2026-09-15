import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingModal } from './onboarding-modal';

describe('OnboardingModal', () => {
  it('não renderiza nada quando open=false', () => {
    const { container } = render(<OnboardingModal open={false} onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o primeiro passo, com "Voltar" desabilitado', () => {
    render(<OnboardingModal open onDismiss={vi.fn()} />);
    expect(screen.getByText('Bem-vindo ao sistema')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled();
  });

  it('"Avançar" passa para o próximo passo e habilita "Voltar"', () => {
    render(<OnboardingModal open onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Avançar' }));
    expect(screen.getByText('Cadastre sua frota')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar' })).not.toBeDisabled();
  });

  it('"Voltar" retorna ao passo anterior', () => {
    render(<OnboardingModal open onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Avançar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByText('Bem-vindo ao sistema')).toBeInTheDocument();
  });

  it('"Pular" chama onDismiss imediatamente, de qualquer passo', () => {
    const onDismiss = vi.fn();
    render(<OnboardingModal open onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('no último passo, o botão de avançar vira "Concluir" e chama onDismiss ao clicar', () => {
    const onDismiss = vi.fn();
    render(<OnboardingModal open onDismiss={onDismiss} />);
    const avancar = () => screen.getByRole('button', { name: 'Avançar' });
    fireEvent.click(avancar());
    fireEvent.click(avancar());
    fireEvent.click(avancar());
    fireEvent.click(avancar());
    expect(screen.queryByRole('button', { name: 'Avançar' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('fechar pelo X do modal também chama onDismiss', () => {
    const onDismiss = vi.fn();
    render(<OnboardingModal open onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
