// Envelope padrao de resposta da API. Aplicado globalmente pelo
// TransformInterceptor -- nenhum controller precisa montar esse formato
// manualmente.
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
