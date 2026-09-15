import type { HelpModuleId, HelpModuleMeta } from './types';

export const HELP_MODULES: Record<HelpModuleId, HelpModuleMeta> = {
  'primeiros-passos': {
    id: 'primeiros-passos',
    label: 'Primeiros passos',
    description: 'A sequência geral para começar a usar o sistema.',
  },
  operacao: {
    id: 'operacao',
    label: 'Operação',
    description: 'Viagens, veículos, motoristas, entregas, manutenção e frota.',
  },
  comercial: {
    id: 'comercial',
    label: 'Comercial',
    description: 'Clientes, cotações, propostas, pipeline e contratos.',
  },
  financeiro: {
    id: 'financeiro',
    label: 'Financeiro',
    description: 'Contas a pagar e a receber, faturamento, períodos e fechamento.',
  },
  cadastros: {
    id: 'cadastros',
    label: 'Cadastros e administração',
    description: 'Usuários, empresa e demais cadastros do sistema.',
  },
  'driver-app': {
    id: 'driver-app',
    label: 'Aplicativo do motorista',
    description: 'O que o motorista vê e faz no aplicativo, durante a viagem.',
  },
  status: {
    id: 'status',
    label: 'Status e indicadores',
    description: 'O que cada status e indicador do sistema significa.',
  },
  alertas: {
    id: 'alertas',
    label: 'Alertas e notificações',
    description: 'O que cada alerta significa e o que fazer quando ele aparece.',
  },
};

export const HELP_MODULE_ORDER: HelpModuleId[] = [
  'primeiros-passos',
  'operacao',
  'comercial',
  'financeiro',
  'cadastros',
  'driver-app',
  'status',
  'alertas',
];
