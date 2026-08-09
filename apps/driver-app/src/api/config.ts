// EXPO_PUBLIC_API_URL ja existente em .env.example (ex: http://localhost:3333)
// -- a API expoe tudo sob /api/v1 (ver apps/api/src/main.ts).
export const API_BASE_URL = `${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333'}/api/v1`;
