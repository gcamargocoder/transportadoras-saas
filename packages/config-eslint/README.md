# @transportadoras/config-eslint

Config ESLint base (flat config) compartilhada entre os apps.
Cada app importa `baseConfig` e adiciona plugins/regras especificas
(ex: `eslint-plugin-react`, regras do Next.js) no proprio `eslint.config.js`.

Sem regras de negocio aqui — apenas qualidade e padronizacao de codigo.
