// Par de tokens recem-emitidos, antes de serem envelopados na resposta da
// API (AuthTokensDto, que tambem carrega o usuario e metadados). Usado
// internamente entre AuthService.issueTokens() e os metodos publicos.
export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};
