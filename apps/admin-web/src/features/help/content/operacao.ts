import type { HelpArticle } from '../types';

export const OPERACAO_ARTICLES: HelpArticle[] = [
  {
    slug: 'ciclo-de-vida-da-viagem',
    title: 'Como funciona uma viagem',
    module: 'operacao',
    summary: 'O que é uma viagem e quais status ela passa até ser concluída.',
    keywords: ['viagem', 'trip', 'status da viagem', 'planejada', 'em andamento', 'pausada', 'concluída'],
    content: {
      oQueE:
        'Uma viagem representa uma operação de transporte: um motorista e um veículo (ou composição) levando carga de uma origem a um destino.',
      paraQueServe:
        'É o centro da operação. Nela ficam reunidos motorista, composição, rota, entregas, ocorrências, documentos fiscais, despesas e receitas daquele transporte.',
      comoFazer: [
        'Acesse "Viagens" no menu Operação.',
        'Uma viagem nasce como "Planejada".',
        'Conforme a operação avança, o status muda (manualmente, na aba "Visão geral" da viagem): Aguardando motorista ou Aguardando saída → Em andamento → Concluída.',
        'Uma viagem em andamento pode ser Pausada e depois retomada.',
        'Em qualquer status que não seja final, a viagem pode ser cancelada.',
      ],
      oQueAconteceDepois:
        'O início real da viagem (KM inicial, abastecimento) e o encerramento (KM final) são registrados pelo motorista no aplicativo. Na administração, você muda o status e acompanha o que foi registrado.',
      atencao:
        'Uma vez concluída ou cancelada, a viagem não volta a nenhum outro status -- esses dois são estados finais.',
    },
    relatedSlugs: ['criar-uma-viagem', 'composicao', 'torre-de-controle'],
  },
  {
    slug: 'criar-uma-viagem',
    title: 'Como criar uma viagem',
    module: 'operacao',
    summary: 'Passo a passo para cadastrar uma nova viagem.',
    keywords: ['criar viagem', 'nova viagem', 'cadastrar viagem'],
    content: {
      oQueE: 'O cadastro de uma viagem reúne tudo que é necessário para planejar o transporte.',
      paraQueServe: 'Organizar a operação antes que ela comece e permitir o acompanhamento depois.',
      comoFazer: [
        'Acesse "Viagens" e clique em "Nova viagem".',
        'Informe origem e destino.',
        'Selecione o motorista e a composição (veículo + carretas) que vão realizar o transporte -- a composição é obrigatória.',
        'Se for o caso, informe o cliente, a rota de pedágio, a carga planejada e uma viagem anterior (para vincular ida e retorno).',
        'Informe as datas previstas de partida e chegada.',
        'Salve a viagem.',
      ],
      oQueAconteceDepois:
        'A viagem aparece na lista como "Planejada". A partir daí ela pode ser acompanhada pela Torre de Controle e terá seu status atualizado conforme avança.',
      atencao: 'Sem uma composição cadastrada (veículo, e carretas se for o caso), não é possível criar a viagem.',
    },
    relatedSlugs: ['composicao', 'ciclo-de-vida-da-viagem'],
  },
  {
    slug: 'composicao',
    title: 'O que é uma composição',
    module: 'operacao',
    summary: 'O vínculo entre veículo e carretas usado para criar viagens.',
    keywords: ['composição', 'carreta', 'eixos', 'bitrem', 'rodotrem'],
    content: {
      oQueE: 'Uma composição é o conjunto formado por um veículo e, quando for o caso, uma ou mais carretas.',
      paraQueServe:
        'É usada tanto para criar viagens quanto para a conferência de pedágio, onde a quantidade de eixos da composição é comparada com o que foi cobrado nas praças.',
      comoFazer: [
        'Acesse "Composições" no menu Frota.',
        'Clique em "Nova composição".',
        'Selecione o veículo e, se houver, as carretas que compõem o conjunto.',
        'Salve.',
      ],
      oQueAconteceDepois: 'A composição fica disponível para ser escolhida na criação de uma viagem.',
    },
    relatedSlugs: ['criar-uma-viagem', 'cadastro-de-veiculos'],
  },
  {
    slug: 'cadastro-de-veiculos',
    title: 'Como cadastrar um veículo',
    module: 'operacao',
    summary: 'Cadastro, status e documentos do veículo.',
    keywords: ['veículo', 'placa', 'frota', 'ativo', 'inativo', 'suspenso'],
    content: {
      oQueE: 'O cadastro de veículo registra os dados de cada unidade da frota.',
      paraQueServe: 'Permite montar composições, criar viagens, controlar manutenção, pneus, custos e documentos de cada veículo.',
      comoFazer: [
        'Acesse "Veículos" no menu Frota e clique em "Novo veículo".',
        'Informe placa, tipo, propriedade, marca, modelo, quantidade de eixos e odômetro atual.',
        'Salve -- o veículo é criado com status "Ativo".',
      ],
      oQueAconteceDepois:
        'Na página do veículo você encontra abas de Motorista atual, Viagens, Pneus, Checklists, Documentos, Custos e Histórico.',
      atencao:
        'Um veículo pode ser Ativado, Suspenso ou Desativado. Um veículo em manutenção tem status próprio ("Em manutenção") e fica indisponível para novas viagens enquanto durar.',
    },
    relatedSlugs: ['documentos-de-frota', 'composicao', 'status-de-veiculo'],
  },
  {
    slug: 'cadastro-de-motoristas',
    title: 'Como cadastrar um motorista',
    module: 'operacao',
    summary: 'Cadastro, status e vínculo do motorista com o veículo.',
    keywords: ['motorista', 'cnh', 'driver', 'ativo', 'suspenso'],
    content: {
      oQueE: 'O cadastro de motorista registra os dados de cada condutor da frota.',
      paraQueServe: 'Permite vincular o motorista a viagens e a um veículo, além de controlar seus documentos.',
      comoFazer: [
        'Acesse "Motoristas" no menu Frota e clique em "Novo motorista".',
        'Informe nome, CPF, número e categoria da CNH e o vencimento da CNH.',
        'Salve -- o motorista é criado com status "Ativo".',
      ],
      oQueAconteceDepois:
        'Na página do motorista você pode vincular (ou trocar) o veículo atual dele e consultar viagens recentes e documentos.',
      atencao:
        'Um motorista pode ser Ativado, Suspenso ou Desativado. O acesso do motorista ao aplicativo (login) é configurado separadamente e não aparece nesta tela de cadastro.',
    },
    relatedSlugs: ['documentos-de-frota', 'como-o-motorista-usa-o-aplicativo', 'status-de-motorista'],
  },
  {
    slug: 'cadastro-de-carretas',
    title: 'Como cadastrar uma carreta',
    module: 'operacao',
    summary: 'Cadastro simples de carretas, usadas em composições.',
    keywords: ['carreta', 'trailer', 'bitrem', 'rodotrem', 'semirreboque'],
    content: {
      oQueE: 'O cadastro de carreta registra placa e tipo (simples, bitrem, rodotrem, semirreboque, entre outros).',
      paraQueServe: 'Permite incluir a carreta em uma composição, junto com o veículo que vai tracioná-la.',
      comoFazer: [
        'Acesse "Carretas" no menu Frota e clique em "Nova carreta".',
        'Informe placa e tipo.',
        'Salve.',
      ],
      oQueAconteceDepois: 'A carreta fica disponível para ser incluída em composições.',
    },
    relatedSlugs: ['composicao'],
  },
  {
    slug: 'documentos-de-frota',
    title: 'Entenda os documentos de veículos e motoristas',
    module: 'operacao',
    summary: 'CRLV, CNH, ANTT, seguro e como acompanhar o vencimento.',
    keywords: ['documento', 'crlv', 'cnh', 'antt', 'seguro', 'vencimento', 'vencendo', 'vencido'],
    content: {
      oQueE:
        'Veículos e motoristas têm uma aba "Documentos" onde ficam registrados CRLV, ANTT, seguro, licenciamento (do veículo) e CNH, exame médico, MOPP, ANTT (do motorista), entre outros.',
      paraQueServe: 'Manter o controle de quais documentos existem, seu número e data de vencimento.',
      comoFazer: [
        'Na página do veículo ou do motorista, abra a aba "Documentos".',
        'Clique em "Novo documento", escolha o tipo, e informe (se houver) número, data de emissão e data de vencimento.',
        'Salve.',
      ],
      oQueAconteceDepois:
        'Cada documento mostra um selo de status: Válido, Vencendo em breve, Vencido ou Sem vencimento (quando não tem data de validade cadastrada).',
      atencao:
        'Hoje o sistema não impede o início de uma viagem por documento vencido -- é uma informação de acompanhamento, não um bloqueio.',
    },
    relatedSlugs: ['status-de-documento', 'cadastro-de-veiculos', 'cadastro-de-motoristas'],
  },
  {
    slug: 'checklist',
    title: 'Como funciona o checklist',
    module: 'operacao',
    summary: 'Vistoria pré e pós-viagem, preenchida pelo motorista.',
    keywords: ['checklist', 'vistoria', 'pré-viagem', 'pós-viagem', 'item crítico'],
    content: {
      oQueE:
        'O checklist é uma vistoria (pré-viagem ou pós-viagem) com perguntas sobre o estado do veículo, preenchida pelo motorista no aplicativo.',
      paraQueServe: 'Identificar, antes ou depois da viagem, problemas que exijam atenção -- principalmente itens marcados como críticos.',
      comoFazer: [
        'O preenchimento é sempre feito pelo motorista, no aplicativo.',
        'Na administração, acesse "Checklists" para consultar execuções já feitas.',
        'Abra uma execução para ver as respostas e, se houver item crítico não conforme, um destaque aparece na tela.',
      ],
      oQueAconteceDepois:
        'Quando existe um item crítico marcado como "não conforme", é possível abrir uma ordem de manutenção diretamente a partir do checklist, já vinculada a ele.',
      atencao: 'Um item crítico não conforme não bloqueia a conclusão do checklist nem o início da viagem -- ele gera um alerta visual, não um impedimento automático.',
    },
    relatedSlugs: ['como-o-motorista-usa-o-aplicativo', 'manutencao'],
  },
  {
    slug: 'entregas-e-paradas',
    title: 'Como funcionam as entregas de uma viagem',
    module: 'operacao',
    summary: 'Paradas de entrega planejadas, seus status e falhas.',
    keywords: ['entrega', 'parada', 'delivery', 'pendente', 'concluída', 'falhou'],
    content: {
      oQueE: 'Uma viagem pode ter uma ou mais paradas de entrega planejadas.',
      paraQueServe: 'Organizar múltiplos pontos de entrega dentro da mesma viagem e acompanhar o andamento de cada um.',
      comoFazer: [
        'Na página da viagem, abra a aba "Paradas/Entregas" para adicionar, reordenar ou consultar as paradas.',
        'O motorista, pelo aplicativo, marca cada parada como iniciada e depois concluída (ou informa uma falha, com o motivo).',
      ],
      oQueAconteceDepois:
        'Uma parada concluída libera o comprovante de entrega daquele ponto. Os status possíveis são: Pendente, Em andamento, Concluída, Com falha ou Cancelada.',
      atencao: 'A visão consolidada de todas as entregas de todas as viagens fica em "Entregas", no menu Operação.',
    },
    relatedSlugs: ['comprovante-de-entrega', 'ocorrencias', 'status-de-entrega'],
  },
  {
    slug: 'ocorrencias',
    title: 'O que é uma ocorrência',
    module: 'operacao',
    summary: 'Eventos registrados durante a viagem, com tipo e gravidade.',
    keywords: ['ocorrência', 'acidente', 'quebra', 'avaria', 'atraso'],
    content: {
      oQueE:
        'Uma ocorrência é um evento registrado durante a viagem, como acidente, quebra/pane, atraso, desvio de rota, problema de entrega, de documento, de veículo, de combustível ou de pneu, entre outros.',
      paraQueServe: 'Dar visibilidade a problemas reais da operação, com um nível de gravidade (informativa, atenção ou crítica).',
      comoFazer: [
        'A maior parte das ocorrências é registrada pelo motorista, pelo aplicativo, durante a viagem.',
        'Na administração, consulte "Ocorrências Operacionais" (todas) ou "Ocorrências de Entrega" (só as vinculadas a uma parada de entrega).',
        'Abra uma ocorrência para ver detalhes e, se for o caso, marcá-la como resolvida.',
      ],
      oQueAconteceDepois: 'Uma ocorrência crítica em aberto aparece em destaque na Torre de Controle e gera uma notificação para a equipe.',
    },
    relatedSlugs: ['torre-de-controle', 'status-de-ocorrencia'],
  },
  {
    slug: 'comprovante-de-entrega',
    title: 'O que é o comprovante de entrega (POD)',
    module: 'operacao',
    summary: 'A foto do canhoto/recibo assinado, enviada pelo motorista.',
    keywords: ['pod', 'comprovante', 'canhoto', 'assinatura', 'entrega'],
    content: {
      oQueE: 'O comprovante de entrega (também chamado de POD) é a foto do documento assinado no momento da entrega.',
      paraQueServe: 'Comprovar que a entrega foi realizada e permitir a revisão por quem administra a operação.',
      comoFazer: [
        'O motorista tira a foto do comprovante no aplicativo, após concluir a entrega.',
        'Na administração, consulte o comprovante a partir da viagem (aba "Paradas/Entregas" ou "Documentos fiscais").',
        'Se necessário, marque o documento como reconhecido ou inválido.',
      ],
      oQueAconteceDepois: 'Um comprovante pendente de revisão gera uma notificação para a equipe administrativa.',
      atencao: 'O envio do comprovante é feito só pelo aplicativo do motorista -- não há upload de comprovante pela tela de administração.',
    },
    relatedSlugs: ['entregas-e-paradas', 'alertas-e-notificacoes'],
  },
  {
    slug: 'pedagios',
    title: 'Como funciona a conferência de pedágio',
    module: 'operacao',
    summary: 'Como o sistema confere o valor cobrado em cada praça.',
    keywords: ['pedágio', 'toll', 'praça', 'tarifa', 'eixo', 'cobrança', 'divergência'],
    content: {
      oQueE: 'O sistema registra as passagens por praças de pedágio de cada viagem e confere o valor cobrado.',
      paraQueServe: 'Identificar cobranças a mais (sobrecobrança) ou a menos (subcobrança) em relação ao esperado.',
      comoFazer: [
        'Cadastre as praças em "Praças de pedágio" (com a tarifa por eixo) e, se usar, as rotas de pedágio esperadas em "Rotas de pedágio".',
        'Acompanhe as transações em "Pedágios" -- cada uma recebe um veredito de conformidade.',
        'Na viagem, a aba "Pedágios"/"Conciliação de Pedágios" mostra o resultado daquele trajeto.',
      ],
      oQueAconteceDepois: 'O valor esperado é calculado multiplicando a tarifa por eixo da praça pela quantidade de eixos da composição.',
      atencao: 'Quando a praça não tem tarifa cadastrada, a cobrança aparece como "não verificável" -- o sistema nunca inventa um valor esperado.',
    },
    relatedSlugs: ['composicao'],
  },
  {
    slug: 'torre-de-controle',
    title: 'O que é a Torre de Controle',
    module: 'operacao',
    summary: 'Visão em tempo real das viagens que precisam de atenção.',
    keywords: ['torre de controle', 'monitoramento', 'tempo real', 'atraso'],
    content: {
      oQueE: 'A Torre de Controle é uma tela que reúne, em tempo real, as viagens em andamento e destaca as que precisam de atenção.',
      paraQueServe:
        'Permitir que a equipe operacional identifique rapidamente atrasos, ocorrências críticas abertas, manutenção pendente do veículo e checklist com item crítico, sem precisar abrir cada viagem.',
      comoFazer: [
        'Acesse "Torre de Controle" no menu Operação.',
        'Veja o resumo no topo (viagens em andamento, atrasadas, com ocorrência crítica, que exigem intervenção).',
        'Na tabela, identifique a viagem que precisa de atenção e use os links rápidos para abrir motorista, veículo, entregas ou ocorrências.',
      ],
      atencao: 'A Torre de Controle ainda não mostra documentos de frota vencidos -- isso é visto na aba "Documentos" de cada veículo/motorista.',
    },
    relatedSlugs: ['ciclo-de-vida-da-viagem', 'ocorrencias'],
  },
  {
    slug: 'manutencao',
    title: 'Como funciona a manutenção',
    module: 'operacao',
    summary: 'Ordens de manutenção, do diagnóstico até a conclusão.',
    keywords: ['manutenção', 'os', 'ordem de serviço', 'preventiva', 'corretiva'],
    content: {
      oQueE: 'Uma manutenção é uma ordem de serviço aberta para um veículo, preventiva, corretiva, de inspeção ou emergencial.',
      paraQueServe: 'Registrar e acompanhar reparos e revisões, do diagnóstico até a conclusão, com custo e peças usadas.',
      comoFazer: [
        'Acesse "Manutenções" no menu Frota e clique em "Nova manutenção".',
        'Escolha o veículo, o tipo e o componente envolvido.',
        'Conforme a manutenção avança, atualize o status: Aberta → Em diagnóstico → Aguardando aprovação → Aprovada → Em execução → (se faltar peça) Aguardando peças → Concluída.',
        'Para concluir, informe a data e o custo final.',
      ],
      oQueAconteceDepois: 'Enquanto a manutenção está aberta, o veículo pode ficar com status "Em manutenção" e ficar indisponível para novas viagens.',
      atencao: 'A manutenção pode ser cancelada em qualquer etapa anterior à conclusão.',
    },
    relatedSlugs: ['status-de-manutencao', 'checklist'],
  },
  {
    slug: 'pneus',
    title: 'Como funciona o controle de pneus',
    module: 'operacao',
    summary: 'Cadastro, movimentação, recapagem e vida útil dos pneus.',
    keywords: ['pneu', 'recapagem', 'vida útil', 'sulco', 'rodízio'],
    content: {
      oQueE: 'Cada pneu da frota é cadastrado individualmente e acompanhado ao longo de sua vida útil.',
      paraQueServe: 'Saber onde cada pneu está instalado, sua profundidade de sulco e quando está próximo de precisar de troca ou recapagem.',
      comoFazer: [
        'Acesse "Pneus" no menu Frota e cadastre o pneu.',
        'Use "Nova movimentação" para instalar, retirar ou transferir o pneu entre veículos ou o estoque.',
        'Registre inspeções (medição de sulco) e recapagens quando ocorrerem.',
      ],
      oQueAconteceDepois: 'O sistema acompanha o custo por km e o percentual de vida útil já usado de cada pneu.',
    },
  },
  {
    slug: 'abastecimento',
    title: 'Como registrar um abastecimento',
    module: 'operacao',
    summary: 'Registro de combustível e indicadores de consumo.',
    keywords: ['abastecimento', 'combustível', 'litros', 'consumo', 'km/l'],
    content: {
      oQueE: 'Um abastecimento registra a quantidade e o valor de combustível colocado em um veículo.',
      paraQueServe: 'Acompanhar consumo médio (km/L) e custo de combustível, por veículo e por viagem.',
      comoFazer: [
        'A maioria dos abastecimentos durante uma viagem é registrada pelo próprio motorista, no aplicativo.',
        'Na administração, acesse "Abastecimentos" para consultar, criar ou editar registros.',
      ],
      oQueAconteceDepois: 'Os indicadores de consumo médio e custo por km do veículo e da frota são atualizados automaticamente.',
    },
  },
  {
    slug: 'despesas-de-viagem',
    title: 'Como funcionam as despesas de viagem',
    module: 'operacao',
    summary: 'Despesas lançadas na viagem e seu fluxo de aprovação.',
    keywords: ['despesa', 'custo', 'pedágio extra', 'alimentação', 'hospedagem', 'aprovação'],
    content: {
      oQueE: 'Uma despesa de viagem é um gasto como alimentação, hospedagem, pedágio extra, multa, lavagem, entre outros.',
      paraQueServe: 'Registrar o custo real de cada viagem e controlar aprovações antes de gerar um título a pagar.',
      comoFazer: [
        'Acesse "Despesas" e cadastre a despesa vinculada à viagem, escolhendo a categoria.',
        'Uma despesa nasce como "Pendente". Quem tem permissão de aprovação pode Aprovar ou Rejeitar.',
      ],
      oQueAconteceDepois: 'Despesas aprovadas alimentam o custo real da viagem e geram os títulos em Contas a pagar.',
    },
    relatedSlugs: ['contas-a-pagar'],
  },
];
