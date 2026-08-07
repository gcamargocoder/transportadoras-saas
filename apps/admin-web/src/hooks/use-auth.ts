'use client';

import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from '../lib/auth/auth-context';

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>.');
  return ctx;
}
