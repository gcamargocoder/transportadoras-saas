import {
  Activity,
  Bell,
  Building2,
  CircleDot,
  Container,
  Fuel,
  Gauge,
  HandCoins,
  LayoutDashboard,
  LayoutGrid,
  ShieldCheck,
  Link2,
  MapPinned,
  Milestone,
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
import { TenantModule } from '../types/enums';
import type { UserRole } from '../types/enums';
import {
  ADMIN_ROLES,
  DASHBOARD_ROLES,
  DRIVER_READ_ROLES,
  FLEET_OPERATIONS_READ_ROLES,
  FLEET_READ_ROLES,
  FUEL_STATION_READ_ROLES,
  FUEL_SUPPLY_READ_ROLES,
  SUPER_ADMIN_ONLY,
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
  // Fase 48 -- quando presente, o item so aparece se o modulo estiver
  // habilitado no plano do tenant (checagem real e sempre no backend; isto
  // e so UX). Itens sem correspondencia clara de modulo (dashboard,
  // cadastros centrais) ficam sem esta prop.
  module?: TenantModule;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Visão geral',
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        roles: DASHBOARD_ROLES,
        module: TenantModule.DASHBOARDS,
      },
      // Fase 69 -- sem restricao de role/modulo: qualquer usuario autenticado
      // ve as PROPRIAS notificacoes (mesmo criterio do backend, que nunca
      // aplica @Roles em NotificationsController -- o isolamento e por
      // usuario, nao por papel).
      { label: 'Notificações', href: '/notifications', icon: Bell, roles: [] },
    ],
  },
  {
    label: 'Operação',
    items: [
      { label: 'Monitoramento', href: '/operations', icon: Activity, roles: TRIP_READ_ROLES },
      {
        label: 'Gestão da frota',
        href: '/operations/fleet',
        icon: LayoutGrid,
        roles: FLEET_OPERATIONS_READ_ROLES,
        module: TenantModule.DASHBOARDS,
      },
      {
        label: 'Viagens',
        href: '/trips',
        icon: Route,
        roles: TRIP_READ_ROLES,
        module: TenantModule.TRIPS,
      },
      {
        label: 'Pedágios',
        href: '/tolls',
        icon: Ticket,
        roles: TOLL_READ_ROLES,
        module: TenantModule.TOLLS,
      },
      {
        label: 'Rotas de pedágio',
        href: '/toll-routes',
        icon: Milestone,
        roles: TOLL_READ_ROLES,
        module: TenantModule.TOLLS,
      },
    ],
  },
  {
    label: 'Frota',
    items: [
      { label: 'Veículos', href: '/vehicles', icon: Truck, roles: FLEET_READ_ROLES },
      { label: 'Carretas', href: '/trailers', icon: Container, roles: FLEET_READ_ROLES },
      { label: 'Composições', href: '/compositions', icon: Link2, roles: FLEET_READ_ROLES },
      { label: 'Motoristas', href: '/drivers', icon: UserRound, roles: DRIVER_READ_ROLES },
      {
        label: 'Pneus',
        href: '/tires',
        icon: CircleDot,
        roles: TIRE_READ_ROLES,
        module: TenantModule.TIRES,
      },
      {
        label: 'Manutenções',
        href: '/maintenances',
        icon: Wrench,
        roles: FLEET_READ_ROLES,
        module: TenantModule.MAINTENANCE,
      },
      {
        label: 'Abastecimentos',
        href: '/fuel-supplies',
        icon: Gauge,
        roles: FUEL_SUPPLY_READ_ROLES,
        module: TenantModule.FUEL,
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
        module: TenantModule.FUEL,
      },
      {
        label: 'Praças de pedágio',
        href: '/toll-plazas',
        icon: MapPinned,
        roles: SUPER_ADMIN_ONLY,
      },
    ],
  },
  {
    label: 'Administração',
    items: [
      { label: 'Empresa', href: '/settings/company', icon: Settings, roles: [] },
      { label: 'Usuários', href: '/settings/users', icon: Users, roles: ADMIN_ROLES },
      // Fase 47 -- area separada (layout proprio, fora do AppShell), so o
      // link de entrada mora aqui no menu normal.
      { label: 'Plataforma', href: '/super-admin', icon: ShieldCheck, roles: SUPER_ADMIN_ONLY },
    ],
  },
];
