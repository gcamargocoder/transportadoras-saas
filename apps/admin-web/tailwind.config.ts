import type { Config } from 'tailwindcss';

// Configuracao base do Tailwind. Nenhum design system/tema de negocio
// foi definido ainda — apenas os caminhos de conteudo para purge.
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
