// Espelha o envelope global de resposta da API (TransformInterceptor /
// AllExceptionsFilter em apps/api/src/common).
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
  path: string;
}

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

// QueryValue/QueryableParams existem para satisfazer a checagem estrutural
// de indice do TypeScript ao passar interfaces nomeadas (FindXQuery) como
// Record<string, QueryValue> no cliente HTTP (ver lib/api/http.ts) --
// interfaces sem assinatura de indice explicita nao sao atribuiveis a
// Record<string, T>, mesmo com todos os campos compativeis.
export type QueryValue = string | number | boolean | undefined | null;

export interface QueryableParams {
  [key: string]: QueryValue;
}

export interface PaginationParams extends QueryableParams {
  page?: number;
  pageSize?: number;
}
