import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../services/AuthContext';

export default function TabLayout() {
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();

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
        tabBarShowLabel: false,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Image
              source={require('../../assets/svg/home.svg')}
              style={{ width: 24, height: 24, tintColor: color }}
              contentFit="contain"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color, focused }) => (
            <Image
              source={require('../../assets/svg/graph.svg')}
              style={{ width: 24, height: 24, tintColor: color }}
              contentFit="contain"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <View className={`rounded-full overflow-hidden border-2 ${focused ? 'border-blue-500' : 'border-transparent'}`} style={{ padding: 1 }}>
              {user?.photoURL ? (
                <Image
                  source={{ uri: user.photoURL }}
                  style={{ width: 24, height: 24, borderRadius: 12 }}
                  contentFit="cover"
                />
              ) : (
                <FontAwesome name="user-circle" size={24} color={color} />
              )}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
