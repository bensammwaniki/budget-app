import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../services/AuthContext';
import { ScrollProvider } from '../../services/ScrollContext';

import CustomTabBar from '../../components/CustomTabBar';

export default function TabLayout() {
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();

  return (
    <ScrollProvider>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
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
    </ScrollProvider>
  );
}
