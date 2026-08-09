import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { TripProvider } from '../trip/TripContext';
import { FuelScreen } from '../screens/FuelScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
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
          </Stack.Navigator>
        </TripProvider>
      )}
    </NavigationContainer>
  );
}
