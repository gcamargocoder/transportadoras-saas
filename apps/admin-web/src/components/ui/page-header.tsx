import type { ReactNode } from 'react';
import type { BreadcrumbItem } from './breadcrumb';
import { Breadcrumb } from './breadcrumb';

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: {
  title: string;
  description?: string | undefined;
  breadcrumb?: BreadcrumbItem[] | undefined;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb && <Breadcrumb items={breadcrumb} />}
        <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
