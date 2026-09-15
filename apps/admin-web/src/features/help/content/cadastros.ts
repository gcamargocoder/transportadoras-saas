import type { HelpArticle } from '../types';

export const CADASTROS_ARTICLES: HelpArticle[] = [
  {
    slug: 'usuarios-e-perfis',
    title: 'Como cadastrar usuários e perfis de acesso',
    module: 'cadastros',
    summary: 'Quem pode acessar o sistema e o que cada perfil pode fazer.',
    keywords: ['usuário', 'perfil', 'acesso', 'permissão', 'role'],
    content: {
      oQueE: 'Cada pessoa que acessa o sistema tem um usuário, com um perfil de acesso (papel) que define o que ela pode ver e fazer.',
      paraQueServe: 'Controlar quem pode usar cada parte do sistema.',
      comoFazer: [
        'Acesse "Usuários" (menu Administração) e clique em "Novo usuário".',
        'Informe nome, e-mail, uma senha provisória e o perfil de acesso.',
        'Salve.',
      ],
      oQueAconteceDepois: 'O usuário pode entrar no sistema com o e-mail e a senha informados. Um usuário pode ser ativado ou desativado depois.',
      atencao:
        'Os perfis disponíveis são: Super admin, Administrador, Gestor, Operador, Despachante, Auditor e Motorista. Cadastro e edição de usuários são restritos a Administradores.',
    },
  },
  {
    slug: 'dados-da-empresa',
    title: 'Como editar os dados da empresa',
    module: 'cadastros',
    summary: 'Razão social, nome fantasia e logotipo da transportadora.',
    keywords: ['empresa', 'tenant', 'razão social', 'cnpj', 'logotipo'],
    content: {
      oQueE: 'A página "Empresa" reúne os dados cadastrais da sua transportadora dentro do sistema.',
      paraQueServe: 'Manter atualizados razão social, nome fantasia e logotipo exibidos no sistema.',
      comoFazer: ['Acesse "Empresa" (menu Administração), edite os campos necessários e salve.'],
      atencao: 'O CNPJ é só leitura, e a edição é restrita a Administradores. A página também mostra o status do plano (teste, ativo, vencido ou suspenso).',
    },
  },
  {
    slug: 'dashboard',
    title: 'O que mostra o Dashboard',
    module: 'cadastros',
    summary: 'Indicadores gerais de operação, financeiro e frota.',
    keywords: ['dashboard', 'painel', 'indicadores', 'visão geral'],
    content: {
      oQueE: 'O Dashboard é a tela inicial com os principais indicadores da operação.',
      paraQueServe: 'Dar uma visão rápida de viagens, motoristas, veículos, resultado financeiro e custos de frota, com filtro por período.',
      comoFazer: ['Acesse "Dashboard" e ajuste o período desejado (De/Até) para atualizar os indicadores.'],
    },
  },
];
