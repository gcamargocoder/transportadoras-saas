import type { HelpArticle } from '../types';

// Parte 8 do pedido -- cobre todos os NotificationType REAIS (confirmados
// em packages/database/prisma/schema.prisma e NOTIFICATION_TYPE_LABELS em
// apps/admin-web/src/lib/labels.ts). Nenhuma regra de alerta foi alterada
// ou criada aqui -- é só explicação do que já existe.
export const ALERTAS_ARTICLES: HelpArticle[] = [
  {
    slug: 'alertas-e-notificacoes',
    title: 'Entenda seus alertas e notificações',
    module: 'alertas',
    summary: 'O que cada notificação significa e se exige uma ação.',
    keywords: ['alerta', 'notificação', 'sino', 'crítico', 'aviso'],
    content: {
      oQueE:
        'As notificações avisam sobre condições que já aconteceram na operação (uma ocorrência crítica, um veículo indisponível, um documento vencendo) ou que pedem atenção (viagem atrasada, manutenção pendente).',
      paraQueServe: 'Evitar que alguém precise abrir cada viagem, veículo ou documento manualmente para descobrir que algo precisa de atenção.',
      comoFazer: [
        'Ocorrência crítica -- uma ocorrência grave foi registrada numa viagem. Exige ação: abra a viagem e trate a ocorrência.',
        'Veículo indisponível -- o veículo está suspenso, em manutenção ou ficou muito tempo sem viagem. Verifique o motivo na página do veículo.',
        'Manutenção atrasada -- existe uma manutenção (ou plano preventivo) com a data programada vencida. Exige ação: trate a ordem de manutenção.',
        'Pneu próximo da troca -- um pneu está com sulco baixo ou já rodou perto da vida útil esperada. Verifique o pneu.',
        'Hodômetro regressivo -- um abastecimento foi lançado com KM menor que o anterior do mesmo veículo. Verifique os lançamentos de combustível, pode ser erro de digitação.',
        'Documento fiscal com problema -- um documento fiscal (CT-e, MDF-e, NF-e etc.) foi marcado como inválido. Verifique o documento.',
        'Viagem atrasada -- a viagem passou da chegada planejada e ainda não foi concluída. Verifique o andamento.',
        'Motorista suspenso / Motorista inativo -- o motorista mudou de status. É informativo, mas pode exigir reorganizar viagens vinculadas a ele.',
        'Faturamento pendente -- existe valor faturável aguardando ser faturado. Exige ação: trate em Faturamento.',
        'Comprovante de entrega pendente -- um comprovante foi enviado pelo motorista e aguarda revisão. Exige ação: revise o documento.',
        'Comprovante de entrega com problema -- o comprovante foi marcado como inválido ou cancelado. Verifique com o motorista/cliente.',
        'Contrato vencendo -- um contrato está perto do fim da vigência (ou já venceu). Verifique se precisa iniciar uma renovação.',
        'Checklist com item crítico -- um checklist concluído teve item crítico marcado como não conforme. Exige ação: avalie se precisa abrir manutenção.',
        'Falha na sincronização de pedágios -- uma fonte oficial de dados de pedágio parou de responder. É um alerta técnico, tratado pelo Super Admin.',
        'Documento de frota vencendo -- um documento de veículo ou motorista (CRLV, ANTT, CNH, seguro) está vencendo ou já venceu. Verifique e providencie a renovação.',
      ],
      oQueAconteceDepois:
        'Ao abrir uma notificação, ela é marcada como lida. A notificação continua no seu histórico -- ela nunca é apagada, só deixa de contar como pendente.',
      atencao:
        'Cada notificação tem uma gravidade (Baixa, Média, Alta ou Crítica) -- quanto maior a gravidade, mais prioridade a situação merece.',
    },
  },
];
