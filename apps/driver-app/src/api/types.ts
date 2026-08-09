// Espelha o envelope de resposta da API (apps/api/src/common/interceptors/transform.interceptor.ts).
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
  path: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  message: string | string[];
  path: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorResponse | null,
  ) {
    super(
      Array.isArray(body?.message)
        ? body.message.join(' ')
        : (body?.message ?? 'Erro inesperado.'),
    );
  }
}
