# @transportadoras/config-typescript

Configuracoes base de TypeScript compartilhadas entre os apps do monorepo.

- `base.json` — regras estritas comuns a todo o projeto (estende `tsconfig.base.json` da raiz).
- `nextjs.json` — ajustes para o painel administrativo (`apps/admin-web`).
- `nestjs.json` — ajustes para o backend (`apps/api`).
- `react-native.json` — ajustes para o app do motorista (`apps/driver-app`).

Cada app importa a variacao correspondente via `"extends"` no proprio `tsconfig.json`.
Nenhuma logica de negocio pertence a este pacote — apenas configuracao de compilador.
