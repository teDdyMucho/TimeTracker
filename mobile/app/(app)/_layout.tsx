import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#101113',
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="clock-in" options={{ headerShown: false }} />
      <Stack.Screen name="log" options={{ title: 'Log Hours', presentation: 'modal' }} />
      <Stack.Screen name="history" options={{ title: 'My Timesheets' }} />
    </Stack>
  );
}
