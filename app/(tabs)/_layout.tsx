import { FontAwesome } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#3b82f6', // Blue 500
        tabBarInactiveTintColor: isDark ? '#64748b' : '#94a3b8', // Slate 500 / Slate 400
        tabBarStyle: {
          backgroundColor: isDark ? '#0f172a' : '#ffffff', // Slate 900 / White
          borderTopWidth: 1,
          borderTopColor: isDark ? '#1e293b' : '#e2e8f0', // Slate 800 / Slate 200
          height: 60 + (insets.bottom > 0 ? insets.bottom : 10), // Dynamic height
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10, // Dynamic padding
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <FontAwesome name="home" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color }) => <FontAwesome name="bar-chart" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <FontAwesome name="user" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
