import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useAuth } from '../../services/AuthContext';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function HomeScreen() {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(' ')[0] || 'User';

  return (
    <ScrollView className="flex-1 bg-[#020617]">
      <StatusBar style="light" />

      {/* Header with Gradient-like background */}
      <View className="px-6 pt-16 pb-8 bg-[#0f172a] rounded-b-[32px] border-b border-slate-800 shadow-lg shadow-black/50">
        <View className="flex-row justify-between items-center mb-8">
          <View>
            <Text className="text-slate-400 text-sm font-medium">Welcome back,</Text>
            <Text className="text-white text-3xl font-bold mt-1">{firstName}! 👋</Text>
          </View>
          <TouchableOpacity className="w-12 h-12 bg-[#1e293b] rounded-full items-center justify-center border border-slate-700">
            <FontAwesome name="bell" size={20} color="#94a3b8" />
            <View className="absolute top-3 right-3.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#1e293b]" />
          </TouchableOpacity>
        </View>

        {/* Balance Card */}
        <View className="bg-blue-600 rounded-3xl p-6 shadow-xl shadow-blue-900/40">
          <View className="flex-row justify-between items-start mb-2">
            <Text className="text-blue-100 font-medium">Total Balance</Text>
            <FontAwesome name="eye" size={16} color="#bfdbfe" />
          </View>
          <Text className="text-white text-4xl font-bold mb-6">KES 42,500</Text>

          <View className="flex-row justify-between">
            <View className="bg-blue-500/30 px-4 py-2 rounded-xl flex-row items-center">
              <View className="w-6 h-6 bg-green-400/20 rounded-full items-center justify-center mr-2">
                <FontAwesome name="arrow-down" size={10} color="#4ade80" />
              </View>
              <Text className="text-white font-semibold">+ 12,000</Text>
            </View>
            <View className="bg-blue-500/30 px-4 py-2 rounded-xl flex-row items-center">
              <View className="w-6 h-6 bg-red-400/20 rounded-full items-center justify-center mr-2">
                <FontAwesome name="arrow-up" size={10} color="#f87171" />
              </View>
              <Text className="text-white font-semibold">- 8,450</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View className="px-6 mt-8">
        <Text className="text-white text-lg font-bold mb-4">Quick Actions</Text>
        <View className="flex-row justify-between">
          {[
            { icon: 'send', label: 'Send', color: '#3b82f6' },
            { icon: 'money', label: 'Pay Bill', color: '#8b5cf6' },
            { icon: 'bank', label: 'Withdraw', color: '#f59e0b' },
            { icon: 'credit-card', label: 'Fuliza', color: '#ef4444' },
          ].map((action, index) => (
            <TouchableOpacity key={index} className="items-center">
              <View
                className="w-16 h-16 rounded-2xl items-center justify-center mb-2 shadow-lg bg-[#1e293b] border border-slate-700"
              >
                <FontAwesome name={action.icon as any} size={24} color={action.color} />
              </View>
              <Text className="text-slate-400 text-xs font-medium">{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Recent Transactions */}
      <View className="px-6 mt-8 mb-8">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-white text-lg font-bold">Recent Transactions</Text>
          <TouchableOpacity>
            <Text className="text-blue-400 font-semibold">See All</Text>
          </TouchableOpacity>
        </View>

        {/* Transactions List */}
        <View className="gap-4">
          {/* Placeholder Transaction Item */}
          <View className="flex-row items-center bg-[#1e293b] p-4 rounded-2xl border border-slate-800 shadow-sm">
            <View className="w-12 h-12 rounded-full bg-[#0f172a] items-center justify-center mr-4 border border-slate-700">
              <FontAwesome name="shopping-cart" size={18} color="#94a3b8" />
            </View>
            <View className="flex-1">
              <Text className="text-white font-semibold text-base">Naivas Supermarket</Text>
              <Text className="text-slate-500 text-xs mt-0.5">Today, 2:30 PM</Text>
            </View>
            <Text className="text-white font-bold">- KES 4,200</Text>
          </View>

          <View className="bg-[#1e293b] rounded-2xl p-8 items-center border border-slate-800 border-dashed">
            <View className="w-16 h-16 bg-[#0f172a] rounded-full items-center justify-center mb-4 border border-slate-700">
              <FontAwesome name="list-alt" size={24} color="#64748b" />
            </View>
            <Text className="text-slate-300 font-semibold text-base mb-2">No more transactions</Text>
            <Text className="text-slate-500 text-sm text-center">
              Sync your messages to see more history
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
