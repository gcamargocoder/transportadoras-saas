import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './input';

describe('Input', () => {
  it('usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    const { container } = render(<Input placeholder="Buscar" />);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.className).toMatch(/bg-surface\b/);
    expect(input.className).not.toMatch(/bg-white/);
  });
});
