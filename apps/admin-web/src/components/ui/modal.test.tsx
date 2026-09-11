import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './modal';

describe('Modal', () => {
  it('usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    render(
      <Modal open onClose={vi.fn()} title="Título">
        conteúdo
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toMatch(/bg-surface\b/);
    expect(dialog.className).not.toMatch(/bg-white/);
  });
});
