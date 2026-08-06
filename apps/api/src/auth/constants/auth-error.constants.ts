// Mensagens de erro padronizadas do modulo Auth. Centralizadas aqui para
// evitar strings duplicadas espalhadas por service/strategy/guard e para
// que os testes possam asserir contra a mesma constante usada em produção.
//
// IMPORTANTE: "usuario inexistente" e "senha invalida" retornam a MESMA
// mensagem/status ao cliente (INVALID_CREDENTIALS) -- e uma decisao
// deliberada de seguranca (OWASP: nao permitir enumeracao de e-mails
// cadastrados via mensagens de erro distintas). Internamente os dois casos
// passam por caminhos de codigo diferentes e podem ser logados de forma
// diferente, mas a resposta HTTP e identica.
export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: 'E-mail ou senha invalidos.',
  USER_INACTIVE: 'Usuario inativo. Entre em contato com o administrador da sua empresa.',
  // Estrutura preparada: nenhum campo de bloqueio existe ainda no schema
  // (UserAccount so tem isActive). Quando um estado de bloqueio explicito
  // for modelado, este codigo/mensagem ja fica pronto para uso.
  USER_BLOCKED: 'Usuario bloqueado. Entre em contato com o administrador da sua empresa.',
  TENANT_INACTIVE: 'Esta empresa esta inativa. Entre em contato com o suporte.',
  TENANT_NOT_FOUND: 'Tenant nao encontrado ou inativo.',
  INVALID_TOKEN: 'Token de acesso invalido.',
  TOKEN_EXPIRED: 'Token de acesso expirado.',
  INVALID_REFRESH_TOKEN: 'Refresh token invalido ou revogado.',
  REFRESH_TOKEN_EXPIRED: 'Refresh token expirado. Faca login novamente.',
} as const;
