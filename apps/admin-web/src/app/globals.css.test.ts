import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'globals.css'), 'utf-8');

describe('globals.css — tokens de tema', () => {
  it('define os tokens no :root (tema claro)', () => {
    const rootBlock = css.split(':root.dark')[0] as string;
    expect(rootBlock).toMatch(/--color-surface:\s*255 255 255/);
    expect(rootBlock).toMatch(/--color-surface-subtle:\s*248 250 252/);
    expect(rootBlock).toMatch(/--color-border:\s*226 232 240/);
    expect(rootBlock).toMatch(/--color-ink:\s*15 23 42/);
    expect(rootBlock).toMatch(/--color-brand-600:\s*79 70 229/);
    expect(rootBlock).toMatch(/--color-success-600:\s*22 163 74/);
    expect(rootBlock).toMatch(/--color-danger-600:\s*220 38 38/);
  });

  it('redefine os mesmos tokens em :root.dark com paleta escura (grafite, nao preto puro)', () => {
    const darkBlock = css.split(':root.dark')[1];
    expect(darkBlock).toBeDefined();
    const block = darkBlock as string;
    expect(block).toMatch(/--color-surface:\s*17 24 33/);
    expect(block).toMatch(/--color-surface-subtle:\s*11 16 22/);
    expect(block).toMatch(/--color-ink:\s*226 232 240/);
    expect(block).toMatch(/--color-border:\s*45 56 70/);
    // Acentos operacionais ficam mais claros no escuro (legibilidade sobre
    // fundo escuro) -- ver rationale no Step 5.
    expect(block).toMatch(/--color-success-600:\s*74 222 128/);
    expect(block).toMatch(/--color-danger-600:\s*248 113 113/);
  });
});
