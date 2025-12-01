import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useAuth } from '../../services/AuthContext';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { getBalance, getTransactions, Transaction, initDatabase } from '../../services/database';
import { syncMessages } from '../../services/smsService';

export default function HomeScreen() {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(' ')[0] || 'User';

  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    const currentBalance = getBalance();
    const recentTransactions = getTransactions().slice(0, 5); // Get top 5
    setBalance(currentBalance);
    setTransactions(recentTransactions);
  }, []);

  // Initial load and on focus
  useFocusEffect(
    useCallback(() => {
      initDatabase();
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    const result = await syncMessages();
    if (result.success) {
      loadData();
      if (result.count && result.count > 0) {
        Alert.alert('Success', `Synced ${result.count} new transactions`);
      }
    } else {
      Alert.alert('Error', 'Failed to sync messages');
    }
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
  };

  return (
    <ScrollView
      className="flex-1 bg-[#020617]"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
      }
    >
      <StatusBar style="light" />

      {/* Header with Gradient-like background */}
      <View className="px-6 pt-16 pb-8 bg-[#0f172a] rounded-b-[32px] border-b border-slate-800 shadow-lg shadow-black/50">
        <View className="flex-row justify-between items-center mb-8">
          <View>
            <Text className="text-slate-400 text-sm font-medium">Welcome back,</Text>
            <Text className="text-white text-3xl font-bold mt-1">{firstName}! 👋</Text>
          </View>
          <TouchableOpacity
            onPress={onRefresh}
            className="w-12 h-12 bg-[#1e293b] rounded-full items-center justify-center border border-slate-700"
          >
            <FontAwesome name="refresh" size={20} color="#3b82f6" />
          </TouchableOpacity>
        </View>

        {/* Balance Card */}
        <View className="bg-blue-600 rounded-3xl p-6 shadow-xl shadow-blue-900/40">
          <View className="flex-row justify-between items-start mb-2">
            <Text className="text-blue-100 font-medium">Total Balance</Text>
            <FontAwesome name="eye" size={16} color="#bfdbfe" />
          </View>
          <Text className="text-white text-4xl font-bold mb-6">{formatCurrency(balance)}</Text>

          <View className="flex-row justify-between">
            <View className="bg-blue-500/30 px-4 py-2 rounded-xl flex-row items-center">
              <View className="w-6 h-6 bg-green-400/20 rounded-full items-center justify-center mr-2">
                <FontAwesome name="arrow-down" size={10} color="#4ade80" />
              </View>
              <Text className="text-white font-semibold">Income</Text>
            </View>
            <View className="bg-blue-500/30 px-4 py-2 rounded-xl flex-row items-center">
              <View className="w-6 h-6 bg-red-400/20 rounded-full items-center justify-center mr-2">
                <FontAwesome name="arrow-up" size={10} color="#f87171" />
              </View>
              <Text className="text-white font-semibold">Expense</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View className="px-6 mt-8">
        <Text className="text-white text-lg font-bold mb-4">Quick Actions</Text>
        <View className="flex-row justify-between">
          {[
            { icon: 'refresh', label: 'Sync SMS', color: '#3b82f6', action: onRefresh },
            { icon: 'money', label: 'Pay Bill', color: '#8b5cf6', action: () => { } },
            { icon: 'bank', label: 'Withdraw', color: '#f59e0b', action: () => { } },
            { icon: 'credit-card', label: 'Fuliza', color: '#ef4444', action: () => { } },
          ].map((action, index) => (
            <TouchableOpacity key={index} className="items-center" onPress={action.action}>
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
          {transactions.length > 0 ? (
            transactions.map((t) => (
              <View key={t.id} className="flex-row items-center bg-[#1e293b] p-4 rounded-2xl border border-slate-800 shadow-sm">
                <View className="w-12 h-12 rounded-full bg-[#0f172a] items-center justify-center mr-4 border border-slate-700">
                  <FontAwesome
                    name={['RECEIVE', 'DEPOSIT'].includes(t.type) ? 'arrow-down' : 'arrow-up'}
                    size={18}
                    color={['RECEIVE', 'DEPOSIT'].includes(t.type) ? '#4ade80' : '#f87171'}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-white font-semibold text-base" numberOfLines={1}>{t.recipient}</Text>
                  <Text className="text-slate-500 text-xs mt-0.5">{new Date(t.date).toLocaleDateString()} • {t.type}</Text>
                </View>
                <Text className={`font-bold ${['RECEIVE', 'DEPOSIT'].includes(t.type) ? 'text-green-400' : 'text-white'}`}>
                  {['RECEIVE', 'DEPOSIT'].includes(t.type) ? '+' : '-'} {formatCurrency(t.amount)}
                </Text>
              </View>
            ))
          ) : (
            <View className="bg-[#1e293b] rounded-2xl p-8 items-center border border-slate-800 border-dashed">
              <View className="w-16 h-16 bg-[#0f172a] rounded-full items-center justify-center mb-4 border border-slate-700">
                <FontAwesome name="list-alt" size={24} color="#64748b" />
              </View>
              <Text className="text-slate-300 font-semibold text-base mb-2">No transactions yet</Text>
              <Text className="text-slate-500 text-sm text-center">
                Tap "Sync SMS" to load your M-PESA history
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
