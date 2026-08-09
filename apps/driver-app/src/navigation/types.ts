export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  StartTrip: { tripId: string };
  Fuel: { tripId: string };
  Toll: { tripId: string };
  Stops: { tripId: string };
};
