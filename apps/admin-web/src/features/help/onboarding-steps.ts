export interface OnboardingStep {
  title: string;
  description: string;
}

// Parte 9 do pedido -- "experiência curta de introdução", não um tutorial
// longo obrigatório. Resumo dos primeiros passos reais (ver
// primeiros-passos.ts para a versão completa, sempre acessível depois pela
// Central de Ajuda).
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: 'Bem-vindo ao sistema',
    description:
      'Este é o painel de controle da sua transportadora: viagens, frota, comercial e financeiro, tudo em um só lugar. Esta introdução rápida mostra por onde começar.',
  },
  {
    title: 'Cadastre sua frota',
    description: 'Comece cadastrando veículos, carretas e motoristas em "Frota", no menu principal.',
  },
  {
    title: 'Cadastre seus clientes',
    description: 'Em "Clientes", cadastre quem contrata o transporte -- eles serão usados nas viagens.',
  },
  {
    title: 'Crie e acompanhe viagens',
    description:
      'Em "Viagens", crie a primeira viagem e acompanhe a operação pela Torre de Controle, enquanto o motorista registra tudo pelo aplicativo.',
  },
  {
    title: 'Precisa de ajuda?',
    description:
      'A qualquer momento, acesse "Central de Ajuda" no menu para rever esta introdução, buscar um artigo ou entender um status ou alerta.',
  },
];
