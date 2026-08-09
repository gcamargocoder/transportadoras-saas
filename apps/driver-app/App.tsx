import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';

// App do motorista (Fase 25) -- login, retomada de viagem, GPS, paradas,
// abastecimento e excecoes de eixo. Ver src/navigation/RootNavigator.tsx
// para a arvore de telas.
export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
