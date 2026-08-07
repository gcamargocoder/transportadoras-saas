import {
  Building2,
  CircleDot,
  Container,
  Fuel,
  Gauge,
  HandCoins,
  LayoutDashboard,
  Receipt,
  Route,
  Settings,
  Ticket,
  TrendingUp,
  Truck,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '../types/enums';
import {
  ADMIN_ROLES,
  DASHBOARD_ROLES,
  DRIVER_READ_ROLES,
  FLEET_READ_ROLES,
  FUEL_STATION_READ_ROLES,
  FUEL_SUPPLY_READ_ROLES,
  TIRE_READ_ROLES,
  TOLL_READ_ROLES,
  TRIP_ADVANCE_READ_ROLES,
  TRIP_EXPENSE_READ_ROLES,
  TRIP_READ_ROLES,
  TRIP_REVENUE_READ_ROLES,
} from './auth/roles';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: UserRole[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Visão geral',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: DASHBOARD_ROLES },
    ],
  },
  {
    label: 'Operação',
    items: [
      { label: 'Viagens', href: '/trips', icon: Route, roles: TRIP_READ_ROLES },
      { label: 'Pedágios', href: '/tolls', icon: Ticket, roles: TOLL_READ_ROLES },
    ],
  },
  {
    label: 'Frota',
    items: [
      { label: 'Veículos', href: '/vehicles', icon: Truck, roles: FLEET_READ_ROLES },
      { label: 'Carretas', href: '/trailers', icon: Container, roles: FLEET_READ_ROLES },
      { label: 'Motoristas', href: '/drivers', icon: UserRound, roles: DRIVER_READ_ROLES },
      { label: 'Pneus', href: '/tires', icon: CircleDot, roles: TIRE_READ_ROLES },
      { label: 'Manutenções', href: '/maintenances', icon: Wrench, roles: FLEET_READ_ROLES },
      {
        label: 'Abastecimentos',
        href: '/fuel-supplies',
        icon: Gauge,
        roles: FUEL_SUPPLY_READ_ROLES,
      },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { label: 'Receitas', href: '/revenues', icon: TrendingUp, roles: TRIP_REVENUE_READ_ROLES },
      { label: 'Despesas', href: '/expenses', icon: Receipt, roles: TRIP_EXPENSE_READ_ROLES },
      {
        label: 'Adiantamentos',
        href: '/advances',
        icon: HandCoins,
        roles: TRIP_ADVANCE_READ_ROLES,
      },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { label: 'Clientes', href: '/customers', icon: Building2, roles: TRIP_READ_ROLES },
      {
        label: 'Postos de combustível',
        href: '/fuel-stations',
        icon: Fuel,
        roles: FUEL_STATION_READ_ROLES,
      },
    ],
  },
  {
    label: 'Administração',
    items: [
      { label: 'Empresa', href: '/settings/company', icon: Settings, roles: [] },
      { label: 'Usuários', href: '/settings/users', icon: Users, roles: ADMIN_ROLES },
    ],
  },
];
