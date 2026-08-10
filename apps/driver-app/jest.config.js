// Fase 31 -- infraestrutura minima de testes do driver-app: jest-expo (preset
// oficial do Expo SDK 51, ja instalado no projeto) + React Native Testing
// Library. Objetivo: testar a logica operacional (syncQueue, telas) sem GPS
// real, servidor real ou dispositivo fisico -- ver jest.setup.js para os
// mocks de infraestrutura nativa (expo-location, AsyncStorage, SecureStore).
// pnpm guarda os pacotes reais achatados em node_modules/.pnpm/<pkg>@<versao>/
// (node_modules/<pkg> e so um symlink para la) -- o padrao "boilerplate" do
// Expo (node_modules/(?!react-native|expo|...)) assume um node_modules
// classico/flat e falha aqui: o Jest resolve o REALPATH (atravessando o
// symlink), entao o primeiro "node_modules/" do caminho e sempre seguido de
// ".pnpm/...", que a negative lookahead nao reconhece como "pacote RN/Expo"
// -- resultado: TUDO cai no "ignorar transformacao", inclusive
// @react-native/js-polyfills (que usa sintaxe Flow e quebra o parser). Este
// padrao mira especificamente node_modules/.pnpm/<pkg>@... deste monorepo.
const RN_TRANSFORM_ALLOWLIST =
  '(jest-)?react-native|@react-native|expo|@expo|react-navigation|@react-navigation|@unimodules|unimodules|sentry-expo|native-base|react-native-svg';

module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [`node_modules/\\.pnpm/(?!(${RN_TRANSFORM_ALLOWLIST}))`],
  // Mock oficial da propria lib -- persistencia em memoria, sem tocar disco
  // real (ver README de @react-native-async-storage/async-storage).
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
  collectCoverage: false,
};
