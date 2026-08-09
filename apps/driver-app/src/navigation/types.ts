export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Fuel: { tripId: string };
  Toll: { tripId: string };
  Stops: { tripId: string };
};
