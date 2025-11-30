import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';

export default function AnalyticsScreen() {
  const { colorScheme } = useColorScheme();

  return (
    <ScrollView className="flex-1 bg-gray-50 dark:bg-[#020617]">
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {/* Header */}
      <View className="px-6 pt-16 pb-6 bg-white dark:bg-[#0f172a] border-b border-gray-200 dark:border-slate-800">
        <Text className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Analytics</Text>
        <Text className="text-slate-500 dark:text-slate-400">Your spending insights</Text>
      </View>

      {/* Coming Soon */}
      <View className="px-6 py-12">
        <View className="bg-white dark:bg-[#1e293b] rounded-3xl p-12 items-center shadow-xl border border-gray-200 dark:border-slate-700">
          <View className="w-24 h-24 rounded-full items-center justify-center mb-6 bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-slate-700 shadow-inner">
            <FontAwesome name="bar-chart" size={40} color="#3b82f6" />
          </View>
          <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Charts Coming Soon</Text>
          <Text className="text-slate-500 dark:text-slate-400 text-center text-base leading-6">
            We're building amazing visualizations for your spending patterns.
            Daily, weekly, monthly, and yearly breakdowns!
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
