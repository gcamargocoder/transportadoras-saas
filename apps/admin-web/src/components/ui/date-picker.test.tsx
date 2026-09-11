import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DatePicker } from './date-picker';

describe('DatePicker', () => {
  it('usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    const { container } = render(<DatePicker />);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.className).toMatch(/bg-surface\b/);
    expect(input.className).not.toMatch(/bg-white/);
  });
});
