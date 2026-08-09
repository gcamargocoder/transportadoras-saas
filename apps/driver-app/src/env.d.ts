// Expo injeta as variaveis EXPO_PUBLIC_* em process.env em tempo de build
// (ver https://docs.expo.dev/guides/environment-variables/) -- RN nao tem um
// `process` global real, so declaramos o suficiente para o typecheck.
declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_WS_URL?: string;
  };
};
