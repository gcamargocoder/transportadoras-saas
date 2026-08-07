import { CalendarDays } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

// Usa o input nativo type="date" (acessivel, funciona em touch, sem
// dependencia extra) com estilo consistente ao design system.
type DatePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  { className, ...props },
  ref,
) {
  return (
    <div className="relative">
      <CalendarDays
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
      />
      <input
        ref={ref}
        type="date"
        className={cn(
          'h-9 w-full rounded-md border border-border-strong bg-white pl-9 pr-3 text-sm text-ink',
          'transition-shadow duration-150 focus:border-brand-500',
          'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle',
          className,
        )}
        {...props}
      />
    </div>
  );
});
