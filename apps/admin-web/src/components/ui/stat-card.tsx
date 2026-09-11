import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Card } from './card';

export interface StatCardTrend {
  value: string;
  /** Direção real do número (sempre honesta — nunca invertida por conveniência). */
  direction: 'up' | 'down';
  /** Se essa direção é boa para o negócio (ex.: despesa caindo = favorável). */
  favorable: boolean;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  tone = 'brand',
  variant = 'default',
  className,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  trend?: StatCardTrend | undefined;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info';
  /** 'gradient' = card de destaque com fundo escuro (uso pontual, 1-2 métricas por dashboard). */
  variant?: 'default' | 'gradient';
  className?: string;
}): JSX.Element {
  if (variant === 'gradient') {
    return (
      <div
        className={cn(
          'rounded-lg bg-gradient-to-br from-brand-700 to-brand-900 p-5 text-white shadow-md',
          className,
        )}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-brand-100">{label}</p>
          {Icon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-white">
              <Icon size={16} />
            </span>
          )}
        </div>
        <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
        {trend && (
          <div
            className={cn(
              'mt-1.5 flex items-center gap-1 text-xs font-medium',
              trend.favorable ? 'text-success-500' : 'text-danger-500',
            )}
          >
            {trend.direction === 'up' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            <span>{trend.value}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card interactive className={cn('p-5', className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        {Icon && (
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md',
              {
                brand: 'bg-brand-50 text-brand-600',
                success: 'bg-success-50 text-success-600',
                warning: 'bg-warning-50 text-warning-600',
                danger: 'bg-danger-50 text-danger-600',
                info: 'bg-info-50 text-info-600',
              }[tone],
            )}
          >
            <Icon size={16} />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      {trend && (
        <div
          className={cn(
            'mt-1.5 flex items-center gap-1 text-xs font-medium',
            trend.favorable ? 'text-success-600' : 'text-danger-600',
          )}
        >
          {trend.direction === 'up' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          <span>{trend.value}</span>
        </div>
      )}
    </Card>
  );
}
