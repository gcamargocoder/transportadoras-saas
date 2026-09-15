import type { HelpArticle } from '../types';

export const DRIVER_APP_ARTICLES: HelpArticle[] = [
  {
    slug: 'como-o-motorista-usa-o-aplicativo',
    title: 'Como o motorista usa o aplicativo',
    module: 'driver-app',
    summary: 'Visão geral do que o motorista vê e faz, do login ao fim da viagem.',
    keywords: ['aplicativo', 'app', 'motorista', 'driver app'],
    content: {
      oQueE: 'O aplicativo do motorista é onde ele recebe a viagem, preenche checklists, registra paradas, entregas, ocorrências, abastecimento e finaliza a viagem.',
      paraQueServe: 'Levar a operação de campo para dentro do sistema, em tempo real.',
      comoFazer: [
        'O motorista entra no aplicativo com e-mail e senha (e o identificador da empresa).',
        'Ao receber uma viagem despachada, ele pode preencher o checklist pré-viagem (opcional) e tocar em "Iniciar viagem", informando o KM atual.',
        'Durante a viagem, ele acompanha a rota, registra paradas, entregas, ocorrências e abastecimentos pelos atalhos da tela inicial.',
        'Ao final, ele toca em "Finalizar viagem" e informa o KM final.',
      ],
      oQueAconteceDepois: 'Tudo que o motorista registra aparece na viagem, do lado da administração, em tempo real (ou assim que a conexão permitir).',
      atencao:
        'O aplicativo funciona com fila offline: se não houver conexão no momento, a ação é guardada e enviada automaticamente depois, na ordem em que ocorreu. Só a criação do checklist e o início de jornada exigem conexão imediata.',
    },
    relatedSlugs: ['checklist', 'entregas-e-paradas', 'comprovante-de-entrega'],
  },
];
