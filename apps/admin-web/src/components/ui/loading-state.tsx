import { Loader2 } from 'lucide-react';

export function LoadingState({ label = 'Carregando' }: { label?: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <Loader2 size={20} className="animate-spin text-brand-600" />
      <p className="text-xs text-ink-muted">{label}...</p>
    </div>
  );
}

export function FullPageLoading(): JSX.Element {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-surface-subtle">
      <Loader2 size={24} className="animate-spin text-brand-600" />
    </div>
  );
}
