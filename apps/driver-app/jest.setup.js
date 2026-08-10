// Fase 31 -- GPS nunca e real em teste (nem dispositivo, nem simulado por
// engano): expo-location fica mockado retornando "sem posicao" por padrao;
// cada teste que precisa de uma posicao especifica sobrescreve com
// jest.spyOn/mockResolvedValueOnce, nunca inventa coordenadas aqui.
jest.mock('expo-location', () => ({
  getLastKnownPositionAsync: jest.fn().mockResolvedValue(null),
  getCurrentPositionAsync: jest.fn().mockResolvedValue(null),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  // Sem implementacao padrao (retorna undefined se chamado sem mock explicito
  // no teste) -- useLocationTracker.test.ts controla o comportamento via
  // jest.spyOn(...).mockImplementation em cada teste.
  watchPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3, High: 4 },
}));
