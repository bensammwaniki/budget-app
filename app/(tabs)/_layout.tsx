import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import CustomTabBar from '../../components/CustomTabBar';
import { useAuth } from '../../services/AuthContext';

export default function TabLayout() {
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
              style={{ width: 26, height: 26 }}
              tintColor={color}
              contentFit="contain"
            />
          ),
        }}
      />

      <Tabs.Screen
        name="income"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('../../assets/svg/analytics.svg')}
              style={{ width: 22, height: 22 }}
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
              source={require('../../assets/svg/debts.svg')}
              style={{ width: 28, height: 28 }}
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
              className={`rounded-full overflow-hidden border ${focused ? 'border-blue-500' : 'border-transparent'
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
