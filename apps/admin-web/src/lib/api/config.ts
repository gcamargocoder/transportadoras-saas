// NEXT_PUBLIC_API_URL e o host puro (ex: http://localhost:3333) -- a API
// expoe app.setGlobalPrefix('api') + versionamento URI (v1), entao todo
// endpoint de negocio vive em `${NEXT_PUBLIC_API_URL}/api/v1/...`.
const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export const API_HOST = RAW_API_URL.replace(/\/+$/, '');
export const API_BASE_URL = `${API_HOST}/api/v1`;
