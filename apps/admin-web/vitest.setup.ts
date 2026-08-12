import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// jsdom nao implementa ResizeObserver -- necessario para renderizar
// recharts.ResponsiveContainer (Fase 40, primeiro teste a montar um
// grafico de verdade em jsdom) sem lancar excecao nao tratada.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

afterEach(() => {
  cleanup();
});
