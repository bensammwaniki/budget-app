import { FontAwesome } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { getTransactions } from '../../services/database';
import { Transaction } from '../../types/transaction';

type Period = 'THIS_MONTH' | 'LAST_MONTH';

export default function AnalyticsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('THIS_MONTH');

  const loadData = useCallback(async () => {
    const allTransactions = await getTransactions();
    setTransactions(allTransactions);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Filter transactions by selected period
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    return transactions.filter(t => {
      const txDate = t.date instanceof Date ? t.date : new Date(t.date);
      if (isNaN(txDate.getTime())) return false;

      if (selectedPeriod === 'THIS_MONTH') {
        return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
      } else if (selectedPeriod === 'LAST_MONTH') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
        return txDate.getMonth() === lastMonth.getMonth() && txDate.getFullYear() === lastMonth.getFullYear();
      }
      return true;
    });
  }, [transactions, selectedPeriod]);

  // Calculate statistics
  const stats = useMemo(() => {
    const income = filteredTransactions
      .filter(t => t.type === 'RECEIVED')
      .reduce((sum, t) => sum + t.amount, 0);

    const expense = filteredTransactions
      .filter(t => t.type === 'SENT')
      .reduce((sum, t) => sum + t.amount, 0);

    // Category breakdown
    const categoryMap: Record<string, { amount: number; color: string; count: number }> = {};
    filteredTransactions
      .filter(t => t.type === 'SENT')
      .forEach(t => {
        const cat = t.categoryName || 'Uncategorized';
        if (!categoryMap[cat]) {
          categoryMap[cat] = { amount: 0, color: t.categoryColor || '#64748b', count: 0 };
        }
        categoryMap[cat].amount += t.amount;
        categoryMap[cat].count += 1;
      });

    const categories = Object.entries(categoryMap)
      .map(([name, data]) => ({
        name,
        amount: data.amount,
        color: data.color,
        count: data.count,
        percentage: expense > 0 ? (data.amount / expense) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      income,
      expense,
      net: income - expense,
      categories,
      avgTransaction: filteredTransactions.length > 0 ? expense / filteredTransactions.filter(t => t.type === 'SENT').length : 0
    };
  }, [filteredTransactions]);

  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  return (
    <ScrollView className="flex-1 bg-gray-50 dark:bg-[#020617]">
      <StatusBar style="light" />

      {/* Header */}
      <View className="px-6 pt-16 pb-8 bg-white dark:bg-[#0f172a] rounded-b-[32px] border-b border-gray-200 dark:border-slate-800 shadow-lg">
        <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Analytics Dashboard</Text>
        <Text className="text-slate-900 dark:text-white text-4xl font-bold mb-6">
          {formatCurrency(stats.expense)}
        </Text>

        {/* Period Selector */}
        <View className="flex-row bg-gray-100 dark:bg-[#1e293b] p-1 rounded-xl self-start border border-gray-200 dark:border-slate-700">
          <TouchableOpacity
            className={`px-4 py-2 rounded-lg ${selectedPeriod === 'THIS_MONTH' ? 'bg-blue-600' : ''}`}
            onPress={() => setSelectedPeriod('THIS_MONTH')}
          >
            <Text className={`font-semibold text-xs ${selectedPeriod === 'THIS_MONTH' ? 'text-white' : 'text-slate-600 dark:text-slate-400'}`}>
              This Month
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`px-4 py-2 rounded-lg ${selectedPeriod === 'LAST_MONTH' ? 'bg-blue-600' : ''}`}
            onPress={() => setSelectedPeriod('LAST_MONTH')}
          >
            <Text className={`font-semibold text-xs ${selectedPeriod === 'LAST_MONTH' ? 'text-white' : 'text-slate-600 dark:text-slate-400'}`}>
              Last Month
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary Cards */}
      <View className="px-6 mt-6">
        <View className="flex-row gap-3 mb-4">
          <View className="flex-1 bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm">
            <View className="flex-row items-center mb-2">
              <FontAwesome name="arrow-down" size={16} color="#10b981" />
              <Text className="text-slate-600 dark:text-slate-400 text-xs ml-2">Income</Text>
            </View>
            <Text className="text-green-600 dark:text-green-400 text-2xl font-bold">{formatCurrency(stats.income)}</Text>
          </View>
          <View className="flex-1 bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm">
            <View className="flex-row items-center mb-2">
              <FontAwesome name="arrow-up" size={16} color="#ef4444" />
              <Text className="text-slate-600 dark:text-slate-400 text-xs ml-2">Expense</Text>
            </View>
            <Text className="text-red-600 dark:text-red-400 text-2xl font-bold">{formatCurrency(stats.expense)}</Text>
          </View>
        </View>

        <View className="bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm">
          <View className="flex-row items-center justify-between">
            <Text className="text-slate-600 dark:text-slate-400 text-sm">Net Balance</Text>
            <Text className={`text-2xl font-bold ${stats.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatCurrency(Math.abs(stats.net))}
            </Text>
          </View>
        </View>
      </View>

      {/* Spending by Category */}
      <View className="px-6 mt-8">
        <Text className="text-slate-900 dark:text-white text-lg font-bold mb-4">Spending by Category</Text>
        {stats.categories.length > 0 ? (
          <View className="bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-200 dark:border-slate-800">
            {stats.categories.slice(0, 8).map((cat, index) => (
              <View key={index} className="mb-4">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center flex-1">
                    <View className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: cat.color }} />
                    <Text className="text-slate-900 dark:text-slate-300 text-sm font-medium flex-1">{cat.name}</Text>
                    <Text className="text-slate-600 dark:text-slate-400 text-xs">{cat.count} txns</Text>
                  </View>
                </View>
                <View className="flex-row items-center">
                  <View className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden mr-3">
                    <View
                      className="h-full rounded-full"
                      style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }}
                    />
                  </View>
                  <Text className="text-slate-900 dark:text-white font-bold w-24 text-right">{formatCurrency(cat.amount)}</Text>
                </View>
                <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1 ml-6">{cat.percentage.toFixed(1)}% of total</Text>
              </View>
            ))}
          </View>
        ) : (
          <View className="bg-white dark:bg-[#1e293b] p-8 rounded-2xl border border-gray-200 dark:border-slate-800 items-center">
            <FontAwesome name="pie-chart" size={48} color="#94a3b8" />
            <Text className="text-slate-500 dark:text-slate-400 mt-4">No expense data for this period</Text>
          </View>
        )}
      </View>

      {/* Quick Stats */}
      <View className="px-6 mt-8 mb-8">
        <Text className="text-slate-900 dark:text-white text-lg font-bold mb-4">Quick Stats</Text>
        <View className="flex-row gap-3">
          <View className="flex-1 bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-200 dark:border-slate-800">
            <FontAwesome name="bar-chart" size={24} color="#3b82f6" />
            <Text className="text-slate-600 dark:text-slate-400 text-xs mt-3 mb-1">Avg Transaction</Text>
            <Text className="text-slate-900 dark:text-white font-bold text-lg">{formatCurrency(stats.avgTransaction)}</Text>
          </View>
          <View className="flex-1 bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-200 dark:border-slate-800">
            <FontAwesome name="hashtag" size={24} color="#8b5cf6" />
            <Text className="text-slate-600 dark:text-slate-400 text-xs mt-3 mb-1">Total Transactions</Text>
            <Text className="text-slate-900 dark:text-white font-bold text-lg">{filteredTransactions.length}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
