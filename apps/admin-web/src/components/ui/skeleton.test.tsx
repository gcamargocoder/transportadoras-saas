import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkeletonCards } from './skeleton';

describe('SkeletonCards', () => {
  it('usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    const { container } = render(<SkeletonCards count={1} />);
    const card = container.firstChild?.firstChild as HTMLElement;
    expect(card.className).toMatch(/bg-surface\b/);
    expect(card.className).not.toMatch(/bg-white/);
  });
});
