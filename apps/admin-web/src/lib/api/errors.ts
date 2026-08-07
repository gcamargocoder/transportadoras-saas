export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly path: string;

  constructor(statusCode: number, code: string, message: string | string[], path: string) {
    super(Array.isArray(message) ? message.join(' ') : message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.path = path;
  }
}

const STATUS_FALLBACK_MESSAGES: Record<number, string> = {
  400: 'Verifique os dados informados e tente novamente.',
  401: 'Sua sessão expirou. Faça login novamente.',
  403: 'Você não tem permissão para realizar esta ação.',
  404: 'Registro não encontrado.',
  409: 'Esta operação entra em conflito com um registro existente.',
  422: 'Não foi possível processar os dados informados.',
  429: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.',
  500: 'Erro interno do servidor. Tente novamente em instantes.',
};

// Converte qualquer erro (ApiError ou nao) numa mensagem amigavel em pt-BR
// para exibicao ao usuario -- nunca expor stack trace/mensagem tecnica.
export function toFriendlyMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message) return error.message;
    return STATUS_FALLBACK_MESSAGES[error.statusCode] ?? 'Ocorreu um erro inesperado.';
  }
  if (error instanceof Error) {
    if (error.message === 'Failed to fetch') {
      return 'Não foi possível conectar ao servidor. Verifique sua conexão.';
    }
    // Erros lancados deliberadamente pelo nosso proprio codigo (ex: rotas de
    // auth em lib/api/auth.api.ts) ja carregam uma mensagem segura para o
    // usuario -- nunca stack trace. So o fallback generico cobre excecoes
    // realmente inesperadas sem mensagem util.
    if (error.message) return error.message;
  }
  return 'Ocorreu um erro inesperado. Tente novamente.';
}
