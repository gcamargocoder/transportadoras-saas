// Chaves de metadata lidas via Reflector pelos guards globais.
export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

// Nome da estrategia Passport usada para validar o access token. Guards
// referenciam esse nome (AuthGuard('jwt')) em vez de repetir a string.
export const JWT_ACCESS_STRATEGY = 'jwt';
