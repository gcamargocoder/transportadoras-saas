import type { HelpArticle } from '../types';

export const COMERCIAL_ARTICLES: HelpArticle[] = [
  {
    slug: 'cadastro-de-clientes',
    title: 'Como cadastrar um cliente',
    module: 'comercial',
    summary: 'Cadastro de clientes, usados em viagens, cotações e contratos.',
    keywords: ['cliente', 'customer', 'cnpj'],
    content: {
      oQueE: 'O cadastro de cliente registra a empresa ou pessoa que contrata o transporte.',
      paraQueServe: 'O cliente é usado em viagens, cotações, propostas, contratos e nos relatórios financeiros por cliente.',
      comoFazer: [
        'Acesse "Clientes" e clique em "Novo cliente".',
        'Informe nome e, se tiver, documento (CNPJ/CPF), telefone, e-mail e endereço.',
        'Salve.',
      ],
      oQueAconteceDepois: 'O cliente fica disponível para ser selecionado em viagens, cotações e propostas.',
    },
  },
  {
    slug: 'cotacoes',
    title: 'O que é uma cotação',
    module: 'comercial',
    summary: 'A solicitação de transporte registrada para um cliente.',
    keywords: ['cotação', 'solicitação de transporte'],
    content: {
      oQueE: 'Uma cotação representa uma solicitação de transporte de um cliente, com origem, destino, tipo de carga e valor.',
      paraQueServe: 'Organizar pedidos comerciais antes de se tornarem uma viagem.',
      comoFazer: [
        'Acesse "Cotações" e crie uma nova, escolhendo o cliente e os dados do transporte solicitado.',
        'O valor pode ser calculado automaticamente (quando houver tabela/regra aplicável) ou informado manualmente.',
        'Envie, aprove ou rejeite a cotação conforme a negociação avança.',
      ],
      oQueAconteceDepois: 'Uma cotação aprovada pode ser convertida em viagem -- esse é o único caminho para o status "Convertida".',
      atencao: 'Rejeitada, convertida e cancelada são status finais -- uma cotação nesses estados não muda mais.',
    },
    relatedSlugs: ['criar-uma-viagem', 'propostas'],
  },
  {
    slug: 'propostas',
    title: 'O que é uma proposta',
    module: 'comercial',
    summary: 'O documento comercial formal enviado ao cliente.',
    keywords: ['proposta', 'proposal'],
    content: {
      oQueE: 'Uma proposta é um documento comercial formal enviado a um cliente, com valor total e validade.',
      paraQueServe: 'Formalizar uma oferta comercial, independente de já existir uma cotação.',
      comoFazer: [
        'Acesse "Propostas" e crie uma nova, em rascunho.',
        'Edite o conteúdo livremente enquanto estiver em rascunho.',
        'Envie a proposta -- a partir daí o conteúdo não pode mais ser editado.',
        'Registre o resultado: aceita, recusada, expirada ou cancelada.',
      ],
      oQueAconteceDepois: 'Só é possível alterar o conteúdo da proposta enquanto ela ainda está em rascunho.',
    },
  },
  {
    slug: 'pipeline-comercial',
    title: 'Como funciona o pipeline comercial',
    module: 'comercial',
    summary: 'Acompanhamento de oportunidades até o fechamento.',
    keywords: ['pipeline', 'funil', 'oportunidade', 'kanban'],
    content: {
      oQueE: 'O pipeline comercial acompanha oportunidades de negócio desde a cotação até o fechamento (ganho ou perda).',
      paraQueServe: 'Visualizar, em um quadro (kanban) ou lista, em que etapa está cada oportunidade e a taxa de conversão geral.',
      comoFazer: [
        'Acesse "Pipeline Comercial".',
        'Crie uma oportunidade ou mova uma existente entre as etapas, informando o motivo da mudança.',
      ],
      oQueAconteceDepois: 'O painel mostra oportunidades abertas, valor estimado em aberto, ganhas, perdidas e a taxa de conversão.',
    },
  },
  {
    slug: 'contratos-e-renovacao',
    title: 'Como funcionam os contratos e sua renovação',
    module: 'comercial',
    summary: 'Contratos de frete por cliente e o processo de renovação.',
    keywords: ['contrato', 'renovação', 'vigência', 'vencendo'],
    content: {
      oQueE: 'Um contrato é um acordo comercial de frete com um cliente, com vigência de início e fim.',
      paraQueServe: 'Vincular tabelas de frete e condições comerciais que valem durante o período do contrato.',
      comoFazer: [
        'Acesse "Fretes" (menu Operação/Gestão da frota) e abra a aba "Contratos".',
        'Para renovar um contrato perto do fim da vigência: clique em "Iniciar renovação" (o contrato original não é alterado ainda).',
        'Depois, "Concluir renovação" cria um novo contrato com a nova vigência e condições, ativa o novo e marca o contrato anterior como vencido.',
      ],
      oQueAconteceDepois: 'O painel de renovações mostra contratos vencendo ou vencidos e o histórico de renovações já feitas.',
      atencao: 'A renovação nunca altera o contrato original -- ela sempre cria um contrato novo.',
    },
    relatedSlugs: ['status-financeiro'],
  },
  {
    slug: 'fretes-e-tabelas',
    title: 'Como é definido o valor de um frete',
    module: 'comercial',
    summary: 'Contrato, tabela de frete e regras de cálculo.',
    keywords: ['frete', 'tabela de frete', 'tarifa', 'simulador'],
    content: {
      oQueE: 'O valor de um frete é definido por um contrato vinculado a uma tabela de frete, que aplica regras de cálculo versionadas.',
      paraQueServe: 'Padronizar e automatizar o cálculo do valor de cada frete, por cliente e rota.',
      comoFazer: [
        'Acesse "Fretes" e consulte as abas Tabelas de frete e Regras.',
        'Use o Simulador para testar o valor resultante de uma combinação antes de aplicá-la.',
      ],
      oQueAconteceDepois: 'O dashboard de Fretes compara o valor contratado, o realizado e a margem prevista com o resultado real.',
      atencao: 'Só regras com status "Ativa" são usadas pelo motor de cálculo -- regras "Arquivadas" ficam só como histórico.',
    },
  },
];
