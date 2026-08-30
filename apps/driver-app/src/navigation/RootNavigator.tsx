import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { TripProvider } from '../trip/TripContext';
import { ChecklistExecutionScreen } from '../screens/ChecklistExecutionScreen';
import { ChecklistScreen } from '../screens/ChecklistScreen';
import { DeliveryProofScreen } from '../screens/DeliveryProofScreen';
import { DeliveryStopsScreen } from '../screens/DeliveryStopsScreen';
import { FinishTripScreen } from '../screens/FinishTripScreen';
import { FuelScreen } from '../screens/FuelScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { OccurrenceScreen } from '../screens/OccurrenceScreen';
import { ShiftScreen } from '../screens/ShiftScreen';
import { StartTripScreen } from '../screens/StartTripScreen';
import { StopsScreen } from '../screens/StopsScreen';
import { TollScreen } from '../screens/TollScreen';
import { colors } from '../theme/colors';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface },
};

// TripProvider so existe DENTRO da sessao autenticada -- garante que
// GET /driver/trips/active (e a localizacao/deteccao de parada que dependem
// dele) nunca rodam antes do login.
export function RootNavigator(): React.JSX.Element {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      {!isAuthenticated ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      ) : (
        <TripProvider>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen
              name="StartTrip"
              component={StartTripScreen}
              options={{ headerShown: true, title: 'Iniciar viagem' }}
            />
            <Stack.Screen
              name="FinishTrip"
              component={FinishTripScreen}
              options={{ headerShown: true, title: 'Finalizar viagem' }}
            />
            <Stack.Screen
              name="Fuel"
              component={FuelScreen}
              options={{ headerShown: true, title: 'Abastecimento' }}
            />
            <Stack.Screen
              name="Toll"
              component={TollScreen}
              options={{ headerShown: true, title: 'Pedagio' }}
            />
            <Stack.Screen
              name="Stops"
              component={StopsScreen}
              options={{ headerShown: true, title: 'Paradas' }}
            />
            <Stack.Screen
              name="DeliveryStops"
              component={DeliveryStopsScreen}
              options={{ headerShown: true, title: 'Entregas' }}
            />
            <Stack.Screen
              name="DeliveryProof"
              component={DeliveryProofScreen}
              options={{ headerShown: true, title: 'Comprovante de entrega' }}
            />
            <Stack.Screen
              name="Occurrence"
              component={OccurrenceScreen}
              options={{ headerShown: true, title: 'Ocorrências' }}
            />
            <Stack.Screen
              name="Shift"
              component={ShiftScreen}
              options={{ headerShown: true, title: 'Jornada' }}
            />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ headerShown: true, title: 'Notificações' }}
            />
            <Stack.Screen
              name="Checklist"
              component={ChecklistScreen}
              options={{ headerShown: true, title: 'Checklist' }}
            />
            <Stack.Screen
              name="ChecklistExecution"
              component={ChecklistExecutionScreen}
              options={{ headerShown: true, title: 'Checklist' }}
            />
          </Stack.Navigator>
        </TripProvider>
      )}
    </NavigationContainer>
  );
}
