import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }): JSX.Element {
  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-xs text-ink-subtle">
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 && <ChevronRight size={12} className="shrink-0" />}
          {item.href ? (
            <Link href={item.href} className="hover:text-ink">
              {item.label}
            </Link>
          ) : (
            <span className={index === items.length - 1 ? 'text-ink-muted' : ''}>{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
