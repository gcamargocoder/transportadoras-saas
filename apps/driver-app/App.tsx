import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

// Entry point minimo do app. Nenhuma tela de negocio (login, mapa,
// viagem ativa etc.) foi implementada nesta etapa.
export default function App() {
  return (
    <View>
      <StatusBar style="auto" />
    </View>
  );
}
