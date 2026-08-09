import * as SecureStore from 'expo-secure-store';

// Sessao do motorista (Fase 25) -- persistida em armazenamento seguro do
// dispositivo (Keychain/Keystore), nao em AsyncStorage puro, porque contem
// os tokens de autenticacao.
const KEYS = {
  accessToken: 'driverapp.accessToken',
  refreshToken: 'driverapp.refreshToken',
  tenantId: 'driverapp.tenantId',
} as const;

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
}

export async function saveSession(session: StoredSession): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.accessToken, session.accessToken),
    SecureStore.setItemAsync(KEYS.refreshToken, session.refreshToken),
    SecureStore.setItemAsync(KEYS.tenantId, session.tenantId),
  ]);
}

export async function loadSession(): Promise<StoredSession | null> {
  const [accessToken, refreshToken, tenantId] = await Promise.all([
    SecureStore.getItemAsync(KEYS.accessToken),
    SecureStore.getItemAsync(KEYS.refreshToken),
    SecureStore.getItemAsync(KEYS.tenantId),
  ]);
  if (!accessToken || !refreshToken || !tenantId) return null;
  return { accessToken, refreshToken, tenantId };
}

export async function updateAccessToken(accessToken: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.accessToken, accessToken);
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.accessToken),
    SecureStore.deleteItemAsync(KEYS.refreshToken),
    SecureStore.deleteItemAsync(KEYS.tenantId),
  ]);
}
