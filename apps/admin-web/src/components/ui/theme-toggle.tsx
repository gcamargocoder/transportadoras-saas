'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type Theme } from '../../hooks/use-theme';
import { Dropdown } from './dropdown';

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

export function ThemeToggle(): JSX.Element {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const ActiveIcon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <Dropdown
      align="end"
      trigger={
        <span
          className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
          aria-label="Alternar tema"
        >
          <ActiveIcon size={17} />
        </span>
      }
      items={OPTIONS.map((option) => ({
        label: option.value === theme ? `${option.label} ✓` : option.label,
        icon: <option.icon size={14} />,
        onClick: () => setTheme(option.value),
      }))}
    />
  );
}
