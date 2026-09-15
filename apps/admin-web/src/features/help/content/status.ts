import type { HelpArticle } from '../types';

// Parte 7 do pedido -- somente estados EFETIVAMENTE existentes (conferidos
// em apps/admin-web/src/lib/labels.ts e types/enums.ts). Nenhum estado novo
// foi criado ou documentado como existente sem estar no enum real.
export const STATUS_ARTICLES: HelpArticle[] = [
  {
    slug: 'status-da-viagem',
    title: 'O que significa cada status de viagem',
    module: 'status',
    summary: 'Planejada, Aguardando motorista/saída, Em andamento, Pausada, Concluída, Cancelada.',
    keywords: ['status da viagem', 'planejada', 'em andamento', 'pausada', 'concluída', 'cancelada'],
    content: {
      comoFazer: [
        'Planejada -- a viagem foi criada, mas ainda não começou.',
        'Aguardando motorista / Aguardando saída -- etapas intermediárias antes do início, opcionais de usar.',
        'Em andamento -- o motorista já iniciou a viagem.',
        'Pausada -- a viagem está temporariamente interrompida e pode voltar a "Em andamento".',
        'Concluída -- a viagem terminou normalmente. Não muda mais de status.',
        'Cancelada -- a viagem foi cancelada. Não muda mais de status.',
      ],
    },
    relatedSlugs: ['ciclo-de-vida-da-viagem'],
  },
  {
    slug: 'status-de-entrega',
    title: 'O que significa cada status de entrega (parada)',
    module: 'status',
    summary: 'Pendente, Em andamento, Concluída, Com falha, Cancelada.',
    keywords: ['status de entrega', 'parada', 'pendente', 'concluída', 'com falha'],
    content: {
      comoFazer: [
        'Pendente -- a parada de entrega ainda não foi iniciada.',
        'Em andamento -- o motorista já chegou/iniciou a entrega.',
        'Concluída -- a entrega foi realizada com sucesso.',
        'Com falha -- a entrega não pôde ser concluída (o motorista informa o motivo).',
        'Cancelada -- a parada foi cancelada.',
      ],
    },
    relatedSlugs: ['entregas-e-paradas'],
  },
  {
    slug: 'status-de-ocorrencia',
    title: 'O que significa cada status e gravidade de ocorrência',
    module: 'status',
    summary: 'Em aberto, Em andamento, Resolvida, Cancelada; Informativa, Atenção, Crítica.',
    keywords: ['status de ocorrência', 'gravidade', 'severidade', 'crítica'],
    content: {
      comoFazer: [
        'Status: Em aberto -- ainda não foi tratada. Em andamento -- já está sendo tratada. Resolvida -- o problema foi solucionado. Cancelada -- o registro foi cancelado.',
        'Gravidade (ocorrências gerais): Informativa, Atenção ou Crítica.',
        'Gravidade (ocorrências de entrega): Baixa, Média ou Alta.',
      ],
      atencao: 'Uma ocorrência Crítica em aberto é o tipo de evento que aparece em destaque na Torre de Controle.',
    },
    relatedSlugs: ['ocorrencias'],
  },
  {
    slug: 'status-de-veiculo',
    title: 'O que significa cada status de veículo',
    module: 'status',
    summary: 'Ativo, Inativo, Suspenso, Em manutenção, Vendido.',
    keywords: ['status de veículo', 'ativo', 'suspenso', 'em manutenção', 'vendido'],
    content: {
      comoFazer: [
        'Ativo -- o veículo está disponível para operar.',
        'Em manutenção -- o veículo está em reparo e fica indisponível para novas viagens enquanto durar.',
        'Suspenso -- o veículo foi temporariamente retirado de operação.',
        'Inativo -- o veículo não está em uso.',
        'Vendido -- o veículo não pertence mais à frota.',
      ],
    },
    relatedSlugs: ['cadastro-de-veiculos'],
  },
  {
    slug: 'status-de-motorista',
    title: 'O que significa cada status de motorista',
    module: 'status',
    summary: 'Ativo, Suspenso, Inativo.',
    keywords: ['status de motorista', 'ativo', 'suspenso', 'inativo'],
    content: {
      comoFazer: [
        'Ativo -- o motorista pode ser vinculado a viagens.',
        'Suspenso -- o motorista está temporariamente impedido de operar.',
        'Inativo -- o motorista não está mais em atividade.',
      ],
    },
    relatedSlugs: ['cadastro-de-motoristas'],
  },
  {
    slug: 'status-de-documento',
    title: 'O que significa cada status de vencimento de documento',
    module: 'status',
    summary: 'Válido, Vencendo em breve, Vencido, Sem vencimento.',
    keywords: ['status de documento', 'válido', 'vencendo', 'vencido', 'crlv', 'cnh'],
    content: {
      comoFazer: [
        'Válido -- o documento está dentro do prazo, sem necessidade de atenção ainda.',
        'Vencendo em breve -- o vencimento está próximo (dentro de 30 dias).',
        'Vencido -- a data de vencimento já passou.',
        'Sem vencimento -- o documento não tem uma data de validade cadastrada.',
      ],
      atencao: 'Esse status é só informativo hoje -- não impede o início de uma viagem.',
    },
    relatedSlugs: ['documentos-de-frota'],
  },
  {
    slug: 'status-de-manutencao',
    title: 'O que significa cada status de manutenção',
    module: 'status',
    summary: 'Aberta, Em diagnóstico, Aguardando aprovação, Aprovada, Em execução, Aguardando peças, Concluída, Cancelada.',
    keywords: ['status de manutenção', 'os', 'ordem de serviço'],
    content: {
      comoFazer: [
        'Aberta -- a ordem de manutenção foi criada.',
        'Em diagnóstico -- o problema está sendo avaliado.',
        'Aguardando aprovação -- o reparo precisa ser aprovado antes de seguir.',
        'Aprovada -- o reparo foi autorizado.',
        'Em execução -- o reparo está sendo feito.',
        'Aguardando peças -- falta alguma peça para concluir.',
        'Concluída -- o reparo terminou (com data e custo final informados).',
        'Cancelada -- a manutenção foi cancelada.',
      ],
    },
    relatedSlugs: ['manutencao'],
  },
  {
    slug: 'status-de-checklist',
    title: 'O que significa cada status de checklist',
    module: 'status',
    summary: 'Rascunho, Em andamento, Concluído, Reprovado, Cancelado.',
    keywords: ['status de checklist', 'rascunho', 'concluído', 'reprovado'],
    content: {
      comoFazer: [
        'Rascunho -- o checklist foi criado, mas ainda não foi aberto para preenchimento.',
        'Em andamento -- o motorista está preenchendo.',
        'Concluído -- o checklist foi finalizado.',
        'Reprovado -- o checklist foi finalizado com reprovação.',
        'Cancelado -- o checklist foi cancelado.',
      ],
    },
    relatedSlugs: ['checklist'],
  },
  {
    slug: 'status-financeiro',
    title: 'O que significa cada status financeiro',
    module: 'status',
    summary: 'Contas a pagar/receber, períodos e contratos.',
    keywords: ['status financeiro', 'em aberto', 'pago', 'recebido', 'vencido', 'fechado'],
    content: {
      comoFazer: [
        'Contas a pagar: Em aberto, Pago parcialmente, Pago, Vencido (calculado pela data) ou Cancelado.',
        'Contas a receber: Em aberto, Recebido parcialmente, Recebido, Vencido (calculado pela data) ou Cancelado.',
        'Período financeiro: Aberto ou Fechado (fechamento é definitivo, sem reabertura nesta versão).',
        'Contrato: Rascunho, Ativo, Suspenso, Vencido ou Cancelado.',
      ],
    },
    relatedSlugs: ['contas-a-pagar', 'contas-a-receber', 'periodos-financeiros'],
  },
];
