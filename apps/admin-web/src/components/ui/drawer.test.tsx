import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Drawer } from './drawer';

describe('Drawer', () => {
  it('usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    render(
      <Drawer open onClose={vi.fn()} title="Título">
        conteúdo
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toMatch(/bg-surface\b/);
    expect(dialog.className).not.toMatch(/bg-white/);
  });
});
