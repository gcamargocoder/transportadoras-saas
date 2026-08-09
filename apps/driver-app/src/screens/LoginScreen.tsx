import React, { useState } from 'react';
import { Text } from 'react-native';
import { Button } from '../components/Button';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/types';

// Tela de login (Fase 25) -- tenantId ainda e um campo literal (UUID) porque
// LoginDto do backend exige isso explicitamente e nao ha resolucao por
// subdominio/slug implementada em nenhuma parte da plataforma ainda (o
// proprio admin-web pede o mesmo campo). Documentado no relatorio final como
// pendencia de UX de login, nao criada nem resolvida nesta fase.
export function LoginScreen(): React.JSX.Element {
  const { login } = useAuth();
  const [tenantId, setTenantId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      await login({ tenantId: tenantId.trim(), email: email.trim(), password });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nao foi possivel entrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <Text style={{ color: '#F8FAFC', fontSize: 24, fontWeight: '700', marginTop: 40 }}>
        Entrar
      </Text>
      <TextField
        label="Id da empresa"
        value={tenantId}
        onChangeText={setTenantId}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <TextField label="Senha" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text style={{ color: '#DC2626' }}>{error}</Text> : null}
      <Button label="Entrar" onPress={handleSubmit} loading={loading} />
    </ScreenContainer>
  );
}
