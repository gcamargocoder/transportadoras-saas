// Configuracao padrao do Metro para monorepos pnpm (ver
// https://docs.expo.dev/guides/monorepos/) -- faltava desde a fundacao do
// projeto; sem isso, o bundler nao resolve corretamente pacotes hospedados
// no node_modules/.pnpm da raiz do workspace (o problema so ficou visivel
// agora, na Fase 25, ao adicionar as primeiras dependencias nativas alem de
// expo/react/react-native).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// O Metro precisa observar a raiz do workspace (onde o pnpm hospeda os
// pacotes reais) alem da pasta do app.
config.watchFolders = [workspaceRoot];

// Resolve modulos tanto em apps/driver-app/node_modules quanto na raiz.
// disableHierarchicalLookup fica OFF (diferente da receita padrao para
// yarn/npm hoisted): o pnpm usa node_modules aninhados dentro de cada
// pacote no store (ex: .pnpm/expo@.../node_modules/expo-modules-core) --
// desabilitar a busca hierarquica impede o Metro de achar essas
// dependencias transitivas.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
