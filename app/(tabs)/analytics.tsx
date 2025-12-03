import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { getTransactions } from '../../services/database';
import { Transaction } from '../../types/transaction';

type Period = 'THIS_MONTH' | 'LAST_MONTH';

export default function AnalyticsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('THIS_MONTH');
  const [totalExpense, setTotalExpense] = useState(0);
  const [categoryData, setCategoryData] = useState<{ category: string; amount: number; percentage: number; color: string }[]>([]);

  const loadData = useCallback(async () => {
    const allTransactions = await getTransactions();

    // Filter transactions by selected period
    const now = new Date();
    const filteredTransactions = allTransactions.filter(t => {
      // Ensure we have a valid date object
      const txDate = t.date instanceof Date ? t.date : new Date(t.date);

      // Skip invalid dates
      if (isNaN(txDate.getTime())) {
        console.warn('Invalid date for transaction:', t.id, t.date);
        return false;
      }

      if (selectedPeriod === 'THIS_MONTH') {
        return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
      } else if (selectedPeriod === 'LAST_MONTH') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
        return txDate.getMonth() === lastMonth.getMonth() && txDate.getFullYear() === lastMonth.getFullYear();
      }
      return true;
    });

    // Filter expenses from the filtered transactions
    const expenses = filteredTransactions.filter(t => !['RECEIVE', 'DEPOSIT', 'RECEIVED'].includes(t.type));
    const total = expenses.reduce((sum, t) => sum + t.amount, 0);
    setTotalExpense(total);

    // Group by category
    const grouped: Record<string, number> = {};
    expenses.forEach(t => {
      // Use categoryName if available, else map from type or recipient
      let cat = t.categoryName || 'Uncategorized';
      if (cat === 'Uncategorized' || !cat) {
        // Fallback logic if category is missing - categorize SENT as Transfers
        cat = t.type === 'SENT' ? 'Transfers' : 'Other';
      }
      grouped[cat] = (grouped[cat] || 0) + t.amount;
    });

    const data = Object.keys(grouped).map((cat, index) => ({
      category: cat,
      amount: grouped[cat],
      percentage: total > 0 ? (grouped[cat] / total) * 100 : 0,
      color: ['#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981'][index % 5]
    })).sort((a, b) => b.amount - a.amount);

    setCategoryData(data);
    setTransactions(allTransactions);
  }, [selectedPeriod]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
  };

  return (
    <ScrollView className="flex-1 bg-[#020617]">
      <StatusBar style="light" />

      {/* Header */}
      <View className="px-6 pt-16 pb-8 bg-[#0f172a] rounded-b-[32px] border-b border-slate-800 shadow-lg">
        <Text className="text-slate-400 text-sm font-medium mb-1">Total Spending</Text>
        <Text className="text-white text-4xl font-bold mb-4">{formatCurrency(totalExpense)}</Text>

        {/* Month Selector */}
        <View className="flex-row bg-[#1e293b] p-1 rounded-xl self-start border border-slate-700">
          <TouchableOpacity
            className={`px-4 py-2 rounded-lg ${selectedPeriod === 'THIS_MONTH' ? 'bg-blue-600' : ''}`}
            onPress={() => setSelectedPeriod('THIS_MONTH')}
          >
            <Text className={`font-semibold text-xs ${selectedPeriod === 'THIS_MONTH' ? 'text-white' : 'text-slate-400'}`}>This Month</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`px-4 py-2 rounded-lg ${selectedPeriod === 'LAST_MONTH' ? 'bg-blue-600' : ''}`}
            onPress={() => setSelectedPeriod('LAST_MONTH')}
          >
            <Text className={`font-semibold text-xs ${selectedPeriod === 'LAST_MONTH' ? 'text-white' : 'text-slate-400'}`}>Last Month</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Spending Breakdown */}
      <View className="px-6 mt-8 mb-8">
        <Text className="text-white text-lg font-bold mb-6">Spending Breakdown</Text>

        {categoryData.length > 0 ? (
          <View className="gap-6">
            {categoryData.map((item, index) => (
              <View key={index}>
                <View className="flex-row justify-between mb-2">
                  <View className="flex-row items-center">
                    <View className={`w-3 h-3 rounded-full mr-2`} style={{ backgroundColor: item.color }} />
                    <Text className="text-white font-semibold">{item.category}</Text>
                  </View>
                  <Text className="text-slate-300 font-medium">{formatCurrency(item.amount)}</Text>
                </View>

                {/* Progress Bar */}
                <View className="h-3 bg-[#1e293b] rounded-full overflow-hidden border border-slate-800">
                  <View
                    className="h-full rounded-full"
                    style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                  />
                </View>
                <Text className="text-slate-500 text-xs mt-1 text-right">{item.percentage.toFixed(1)}%</Text>
              </View>
            ))}
          </View>
        ) : (
          <View className="items-center justify-center py-12 bg-[#1e293b] rounded-3xl border border-slate-800 border-dashed">
            <FontAwesome name="pie-chart" size={48} color="#334155" />
            <Text className="text-slate-500 mt-4">No spending data yet</Text>
          </View>
        )}
      </View>

      {/* AI Insight Card (Mock) */}
      <View className="px-6 mb-8">
        <View className="bg-gradient-to-r from-indigo-500 to-purple-600 p-1 rounded-2xl">
          <View className="bg-[#1e293b] p-5 rounded-xl border border-slate-700">
            <View className="flex-row items-center mb-3">
              <FontAwesome name="magic" size={16} color="#c084fc" />
              <Text className="text-white font-bold ml-2">AI Insight</Text>
            </View>
            <Text className="text-slate-300 text-sm leading-5">
              Your spending on <Text className="text-white font-bold">Shopping</Text> is 15% higher than last month. Consider setting a budget limit.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
