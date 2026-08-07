import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, leadingIcon, trailingIcon, ...props },
  ref,
) {
  return (
    <div className="relative">
      {leadingIcon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle">
          {leadingIcon}
        </span>
      )}
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded-md border bg-white px-3 text-sm text-ink placeholder:text-ink-subtle',
          'transition-shadow duration-150 focus:border-brand-500',
          invalid ? 'border-danger-500' : 'border-border-strong',
          leadingIcon && 'pl-9',
          trailingIcon && 'pr-9',
          'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle',
          className,
        )}
        {...props}
      />
      {trailingIcon && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle">
          {trailingIcon}
        </span>
      )}
    </div>
  );
});
