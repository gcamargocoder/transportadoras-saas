import { cn } from '../../utils/cn';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <div
      className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-border"
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={active === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            active === tab.value
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-ink-muted hover:text-ink',
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 text-xs text-ink-subtle">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
