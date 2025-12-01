import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { getTransactions, Transaction } from '../../services/database';

export default function AnalyticsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalExpense, setTotalExpense] = useState(0);
  const [categoryData, setCategoryData] = useState<{ category: string; amount: number; percentage: number; color: string }[]>([]);

  const loadData = useCallback(() => {
    const allTransactions = getTransactions();

    // Filter expenses
    const expenses = allTransactions.filter(t => !['RECEIVE', 'DEPOSIT'].includes(t.type));
    const total = expenses.reduce((sum, t) => sum + t.amount, 0);
    setTotalExpense(total);

    // Group by category (using recipient as proxy for category for now since we don't have real categorization logic yet)
    // In a real app, we would use the 'category' field which we would populate via AI or rules.
    // For this MVP, let's group by Transaction Type or Recipient Name simplified.
    // Let's use Transaction Type for a cleaner look for now, or just mock categories if empty.

    const grouped: Record<string, number> = {};
    expenses.forEach(t => {
      const cat = t.category !== 'Uncategorized' ? t.category : (t.type === 'PAYBILL' ? 'Bills' : t.type === 'BUYGOODS' ? 'Shopping' : 'Transfers');
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
  }, []);

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

        {/* Month Selector (Mock) */}
        <View className="flex-row bg-[#1e293b] p-1 rounded-xl self-start border border-slate-700">
          <TouchableOpacity className="bg-blue-600 px-4 py-2 rounded-lg">
            <Text className="text-white font-semibold text-xs">This Month</Text>
          </TouchableOpacity>
          <TouchableOpacity className="px-4 py-2 rounded-lg">
            <Text className="text-slate-400 font-semibold text-xs">Last Month</Text>
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
