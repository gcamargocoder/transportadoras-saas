import type { PrimeirosPassosStep } from './types';

// Sequência adaptada ao fluxo REAL encontrado no levantamento (nunca a
// sequência genérica de exemplo): composição (veículo+carretas) é
// obrigatória para criar uma viagem, então entra como passo próprio antes
// de "criar viagem". Acompanhamento em campo (checklist, entregas,
// ocorrências, abastecimento) é feito pelo aplicativo do motorista, não
// pela tela de administração -- por isso aparece como um passo que explica
// isso, em vez de instruções de clique na admin-web.
export const PRIMEIROS_PASSOS_STEPS: PrimeirosPassosStep[] = [
  {
    title: 'Conheça o painel',
    description:
      'No Dashboard você acompanha, de um só lugar, viagens, motoristas, veículos, financeiro e custos de frota. É o ponto de partida para entender como a operação está indo.',
    articleSlug: 'dashboard',
  },
  {
    title: 'Configure sua estrutura',
    description:
      'Confirme os dados da sua empresa e cadastre os usuários que vão operar o sistema, cada um com o perfil de acesso adequado.',
    articleSlug: 'usuarios-e-perfis',
  },
  {
    title: 'Cadastre veículos e carretas',
    description:
      'Cadastre os veículos da frota (com placa, tipo e documentos) e, se usar composições com mais de uma unidade, as carretas também.',
    articleSlug: 'cadastro-de-veiculos',
  },
  {
    title: 'Cadastre motoristas',
    description: 'Cadastre os motoristas com CNH e demais documentos, para que possam ser vinculados a viagens.',
    articleSlug: 'cadastro-de-motoristas',
  },
  {
    title: 'Cadastre clientes',
    description: 'Cadastre os clientes que vão contratar o transporte -- eles aparecem depois em viagens, cotações e contratos.',
    articleSlug: 'cadastro-de-clientes',
  },
  {
    title: 'Monte uma composição',
    description: 'Antes de criar uma viagem, monte a composição: o veículo (e carretas, se houver) que vai realizar o transporte.',
    articleSlug: 'composicao',
  },
  {
    title: 'Crie sua primeira viagem',
    description: 'Com motorista, composição e cliente cadastrados, crie a viagem informando origem, destino e as datas previstas.',
    articleSlug: 'criar-uma-viagem',
  },
  {
    title: 'Acompanhe pela Torre de Controle',
    description: 'Use a Torre de Controle para ver, em tempo real, quais viagens precisam de atenção (atraso, ocorrência crítica, manutenção pendente).',
    articleSlug: 'torre-de-controle',
  },
  {
    title: 'Siga a operação pelo aplicativo do motorista',
    description:
      'O motorista usa o aplicativo para iniciar a viagem, preencher o checklist, registrar paradas, entregas, ocorrências e o comprovante de entrega. Você acompanha tudo isso pela viagem, na administração.',
    articleSlug: 'como-o-motorista-usa-o-aplicativo',
  },
  {
    title: 'Conclua a viagem',
    description: 'Quando a operação terminar, confirme o encerramento da viagem e trate pendências de entregas ou ocorrências, se houver.',
    articleSlug: 'ciclo-de-vida-da-viagem',
  },
  {
    title: 'Consulte os resultados',
    description: 'Volte ao Dashboard e aos relatórios financeiros para ver receita, custo e resultado da operação.',
    articleSlug: 'rentabilidade-por-cliente',
  },
];
