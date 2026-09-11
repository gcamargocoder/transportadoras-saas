import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Select } from './select';

describe('Select', () => {
  it('usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    const { container } = render(
      <Select>
        <option value="a">A</option>
      </Select>,
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.className).toMatch(/bg-surface\b/);
    expect(select.className).not.toMatch(/bg-white/);
  });
});
