import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from './button';

export function ErrorState({
  title = 'Não foi possível carregar os dados.',
  description,
  onRetry,
}: {
  title?: string | undefined;
  description?: string | undefined;
  onRetry?: (() => void) | undefined;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-50 text-danger-600">
        <AlertTriangle size={22} />
      </span>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {description && <p className="mt-1 max-w-sm text-xs text-ink-muted">{description}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw size={14} />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
