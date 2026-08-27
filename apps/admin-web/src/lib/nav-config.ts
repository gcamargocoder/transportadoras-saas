import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  Building2,
  CalendarClock,
  CircleDot,
  Container,
  FileCheck,
  FileText,
  Fuel,
  Gauge,
  Hammer,
  HandCoins,
  Handshake,
  History,
  Kanban,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Package,
  PackageCheck,
  Percent,
  ShieldAlert,
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
  Wallet,
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
  BANK_RECONCILIATION_READ_ROLES,
  FINANCE_AUDIT_READ_ROLES,
  FINANCE_READ_ROLES,
  FINANCIAL_ACCOUNT_READ_ROLES,
  FINANCIAL_PERIOD_READ_ROLES,
  PAYABLE_READ_ROLES,
  PIPELINE_READ_ROLES,
  PROPOSAL_READ_ROLES,
  QUOTATION_READ_ROLES,
  RECEIVABLE_READ_ROLES,
  RECONCILIATION_READ_ROLES,
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
      // Fase 99 -- visao CROSS-TRIP das entregas (TripDeliveryStop, Fase
      // 88), mesmo modulo/roles de Viagens (nunca uma segunda fonte de
      // dados nem um modulo novo).
      {
        label: 'Entregas',
        href: '/operations/deliveries',
        icon: PackageCheck,
        roles: TRIP_READ_ROLES,
        module: TenantModule.TRIPS,
      },
      // Fase 101 -- visao CROSS-TRIP das ocorrencias de ENTREGA (TripOccurrence
      // vinculada a TripDeliveryStop), mesmo modulo/roles de Entregas/Viagens
      // (nunca uma segunda fonte de dados nem um modulo novo). Distinta do
      // dashboard geral de ocorrencias de frota em /operations/fleet/occurrences
      // (todas as ocorrencias, nao so as vinculadas a uma entrega).
      {
        label: 'Ocorrências de Entrega',
        href: '/operations/delivery-occurrences',
        icon: AlertTriangle,
        roles: TRIP_READ_ROLES,
        module: TenantModule.TRIPS,
      },
      // Fase 94 -- sem `module`: solicitacoes comerciais de cliente, mesmo
      // criterio ja usado pelo CRM (Fase 93), funciona mesmo sem o modulo
      // FREIGHT habilitado (calculo automatico cai graciosamente para
      // manualAmount quando nao ha tabela/regra aplicavel).
      { label: 'Cotações', href: '/quotations', icon: FileText, roles: QUOTATION_READ_ROLES },
      // Fase 95 -- mesmo criterio (sem `module`): documento comercial
      // formal, independente do modulo FREIGHT estar habilitado.
      { label: 'Propostas', href: '/proposals', icon: FileCheck, roles: PROPOSAL_READ_ROLES },
      // Fase 96 -- mesmo criterio (sem `module`).
      {
        label: 'Pipeline Comercial',
        href: '/operations/commercial/pipeline',
        icon: Kanban,
        roles: PIPELINE_READ_ROLES,
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
        label: 'Peças',
        href: '/parts',
        icon: Package,
        roles: FLEET_READ_ROLES,
        module: TenantModule.MAINTENANCE,
      },
      {
        label: 'Oficinas',
        href: '/workshops',
        icon: Hammer,
        roles: FLEET_READ_ROLES,
        module: TenantModule.MAINTENANCE,
      },
      {
        label: 'Fornecedores',
        href: '/suppliers',
        icon: Handshake,
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
      {
        label: 'Contas a receber',
        href: '/operations/finance/receivables',
        icon: Wallet,
        roles: RECEIVABLE_READ_ROLES,
        module: TenantModule.FREIGHT,
      },
      {
        label: 'Contas a pagar',
        href: '/operations/finance/payables',
        icon: Wallet,
        roles: PAYABLE_READ_ROLES,
        module: TenantModule.FREIGHT,
      },
      {
        label: 'Fluxo de caixa',
        href: '/operations/finance/cash-flow',
        icon: ArrowLeftRight,
        roles: FINANCE_READ_ROLES,
        module: TenantModule.FREIGHT,
      },
      // Fase 97 -- consolidacao de receita/custo real por cliente, mesmo
      // grupo de leitura financeira (FINANCE_READ_ROLES). Sem `module`:
      // depende so de Trip/TripRevenue/TripExpense (nucleo TRIPS), nunca do
      // modulo FREIGHT (mesmo criterio ja usado por Quotations/Proposals/Pipeline).
      {
        label: 'Rentabilidade por Cliente',
        href: '/operations/finance/customer-profitability',
        icon: Percent,
        roles: FINANCE_READ_ROLES,
      },
      {
        label: 'Conciliação financeira',
        href: '/operations/finance/reconciliation',
        icon: ShieldAlert,
        roles: RECONCILIATION_READ_ROLES,
        module: TenantModule.FREIGHT,
      },
      {
        label: 'Períodos financeiros',
        href: '/operations/finance/periods',
        icon: CalendarClock,
        roles: FINANCIAL_PERIOD_READ_ROLES,
        module: TenantModule.FREIGHT,
      },
      {
        label: 'Auditoria financeira',
        href: '/operations/finance/audit',
        icon: History,
        roles: FINANCE_AUDIT_READ_ROLES,
        module: TenantModule.FREIGHT,
      },
      {
        label: 'Contas financeiras',
        href: '/operations/finance/accounts',
        icon: Landmark,
        roles: FINANCIAL_ACCOUNT_READ_ROLES,
        module: TenantModule.FREIGHT,
      },
      {
        label: 'Conciliação bancária',
        href: '/operations/finance/bank-reconciliation',
        icon: ListChecks,
        roles: BANK_RECONCILIATION_READ_ROLES,
        module: TenantModule.FREIGHT,
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
