import type { ReactNode } from 'react';
import { FleetSectionTabs } from '../../../../features/fleet-operations/fleet-section-tabs';

export default function FleetOperationsLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div>
      <FleetSectionTabs />
      {children}
    </div>
  );
}
