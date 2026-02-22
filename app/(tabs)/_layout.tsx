import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'nativewind';
import React from 'react';
import { View } from 'react-native';
import CustomTabBar from '../../components/CustomTabBar';
import { useAuth } from '../../services/AuthContext';

export default function TabLayout() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Prevent unmounting on tab switch

      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('../../assets/svg/home.svg')}
              style={{ width: 24, height: 24 }}
              tintColor={color}
              contentFit="contain"
            />
          ),
        }}
      />

      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('../../assets/svg/graph.svg')}
              style={{ width: 24, height: 24 }}
              tintColor={color}
              contentFit="contain"
            />
          ),
        }}
      />

      <Tabs.Screen
        name="debts"
        options={{
          title: 'Debts',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('../../assets/svg/debt.svg')}
              style={{ width: 24, height: 24 }}
              tintColor={color}
              contentFit="contain"
            />
          ),
        }}
      />

      <Tabs.Screen
        name="savings"
        options={{
          title: 'Savings',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('../../assets/svg/goal.svg')}
              style={{ width: 24, height: 24 }}
              tintColor={color}
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
            <View
              className={`rounded-full overflow-hidden border-2 ${focused ? 'border-blue-500' : 'border-transparent'
                }`}
              style={{ padding: 1 }}
            >
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