import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastProvider, useToast } from './toast';

function Trigger() {
  const toast = useToast();
  return <button onClick={() => toast.success('Sucesso')}>disparar</button>;
}

describe('ToastProvider', () => {
  it('usa bg-surface no toast (reage ao dark mode), nunca bg-white fixo', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    screen.getByText('disparar').click();

    await waitFor(() => {
      const toastEl = screen.getByRole('status');
      expect(toastEl.className).not.toMatch(/bg-white/);
    });
  });
});
