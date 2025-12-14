import { FontAwesome } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { PieChart } from "react-native-gifted-charts";
import { getTransactions } from '../../services/database';
import { Transaction } from '../../types/transaction';

type Period = 'THIS_MONTH' | 'LAST_MONTH';

import { useColorScheme } from "nativewind";

export default function AnalyticsScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const innerCircleColor = isDark ? '#1e293b' : '#ffffff';
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const loadData = useCallback(async () => {
    const allTransactions = await getTransactions();
    setTransactions(allTransactions);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Generate last 12 months
  const months = useMemo(() => {
    const result = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      result.push(d);
    }
    return result;
  }, []);

  const isSameMonth = (d1: Date, d2: Date) => {
    return d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
  };

  // Filter transactions by selected month
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const txDate = t.date instanceof Date ? t.date : new Date(t.date);
      if (isNaN(txDate.getTime())) return false;
      return isSameMonth(txDate, selectedDate);
    });
  }, [transactions, selectedDate]);

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

  const currentYear = new Date().getFullYear();

  const yearlyStats = useMemo(() => {
    const yearlyTransactions = transactions.filter(t => {
      const txDate = t.date instanceof Date ? t.date : new Date(t.date);
      return txDate.getFullYear() === currentYear;
    });

    const aggregate = (type: 'SENT' | 'RECEIVED') => {
      const map: Record<string, { amount: number; color: string }> = {};

      yearlyTransactions
        .filter(t => t.type === type)
        .forEach(t => {
          const cat = t.categoryName || (type === 'RECEIVED' ? 'Income' : 'Uncategorized');
          // For income that might not have a category color, generate one or use default
          const color = t.categoryColor || (type === 'SENT' ? '#64748b' : '#10b981'); // Default gray for expense, green for income

          if (!map[cat]) {
            map[cat] = { amount: 0, color };
          }
          map[cat].amount += t.amount;
        });

      return Object.entries(map)
        .map(([name, data]) => ({
          value: data.amount,
          color: data.color,
          text: name,
          // Simplify text for small slices or hide it if needed in the UI logic
        }))
        .sort((a, b) => b.value - a.value);
    };

    const expenseData = aggregate('SENT');
    const incomeData = aggregate('RECEIVED');

    // Process colors to ensure they are distinct if needed, but for now relying on category colors

    return {
      expense: expenseData,
      income: incomeData,
      totalExpense: expenseData.reduce((sum, item) => sum + item.value, 0),
      totalIncome: incomeData.reduce((sum, item) => sum + item.value, 0)
    };
  }, [transactions, currentYear]);

  const renderLegend = (data: any[]) => {
    return (
      <View className="flex-row flex-wrap gap-2 mt-4 justify-center">
        {data.slice(0, 5).map((item, index) => (
          <View key={index} className="flex-row items-center mr-2">
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color, marginRight: 6 }} />
            <Text className="text-slate-600 dark:text-slate-400 text-xs">{item.text}</Text>
          </View>
        ))}
      </View>
    );
  };

  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatMonth = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatMonthShort = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short' });
  };

  return (
    <ScrollView className="flex-1 bg-gray-50 dark:bg-[#020617]">
      <StatusBar style="light" />

      {/* Header */}
      <View className="px-6 pt-16 pb-8 bg-white dark:bg-[#0f172a] rounded-b-[32px] border-b border-gray-200 dark:border-slate-800 shadow-lg">
        <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Total Expense • {formatMonth(selectedDate)}</Text>
        <Text className="text-slate-900 dark:text-white text-4xl font-bold mb-6">
          {formatCurrency(stats.expense)}
        </Text>

        {/* New Month Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-row"
          contentContainerStyle={{ gap: 8 }}
        >
          {months.map((date, index) => {
            const isSelected = isSameMonth(date, selectedDate);
            return (
              <TouchableOpacity
                key={index}
                onPress={() => setSelectedDate(date)}
                className={`px-4 py-2 rounded-xl border ${isSelected
                  ? 'bg-blue-600 border-blue-600'
                  : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700'
                  }`}
              >
                <Text className={`font-semibold text-xs ${isSelected
                  ? 'text-white'
                  : 'text-slate-600 dark:text-slate-400'
                  }`}>
                  {index === 0 ? 'This Month' : formatMonthShort(date)}
                </Text>
                <Text className={`text-[10px] text-center mt-1 ${isSelected
                  ? 'text-blue-200'
                  : 'text-slate-400 dark:text-slate-500'
                  }`}>
                  {date.getFullYear()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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

      {/* Monthly Fuliza Fees - Only displayed if there are fees */}
      {filteredTransactions.some(t => t.id.startsWith('FULIZA-FEES-')) && (
        <View className="px-6 mt-8 mb-2">
          <Text className="text-slate-900 dark:text-white text-lg font-bold mb-4">Monthly Fuliza Fees</Text>
          <View className="gap-4">
            {filteredTransactions
              .filter(t => t.id.startsWith('FULIZA-FEES-'))
              .map((tx) => (
                <View
                  key={tx.id}
                  className="flex-row items-center bg-orange-50 dark:bg-orange-900/20 p-4 rounded-2xl border border-orange-100 dark:border-orange-800/50 shadow-sm"
                >
                  <View className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/40 items-center justify-center mr-4 border border-orange-200 dark:border-orange-800">
                    <FontAwesome name="warning" size={20} color="#f97316" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-900 dark:text-white font-bold text-base">{tx.recipientName}</Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">{tx.date.toLocaleDateString()}</Text>
                  </View>
                  <Text className="text-orange-600 dark:text-orange-400 font-bold text-base">
                    - KES {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              ))}
          </View>
        </View>
      )}

      {/* Year-to-Date Stats */}
      <View className="px-6 mt-8 mb-8">
        <Text className="text-slate-900 dark:text-white text-lg font-bold mb-4">{currentYear} Summary</Text>

        <View className="flex-col gap-6">
          {/* Income Chart */}
          <View className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl border border-gray-200 dark:border-slate-800 items-center">
            <Text className="text-slate-600 dark:text-slate-400 text-sm font-semibold mb-4 w-full text-left">Yearly Income</Text>
            {yearlyStats.income.length > 0 ? (
              <>
                <PieChart
                  data={yearlyStats.income}
                  donut
                  showText={false}
                  radius={80}
                  innerRadius={60}
                  innerCircleColor={innerCircleColor}
                  centerLabelComponent={() => {
                    return (
                      <View className="items-center justify-center">
                        <Text className="text-slate-900 dark:text-white text-xs font-bold">Total</Text>
                        <Text className="text-slate-500 dark:text-slate-400 text-[10px]">{formatCurrency(yearlyStats.totalIncome)}</Text>
                      </View>
                    );
                  }}
                />
                {renderLegend(yearlyStats.income)}
              </>
            ) : (
              <Text className="text-slate-400 dark:text-slate-500 py-8">No income data for {currentYear}</Text>
            )}
          </View>

          {/* Expenditure Chart */}
          <View className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl border border-gray-200 dark:border-slate-800 items-center">
            <Text className="text-slate-600 dark:text-slate-400 text-sm font-semibold mb-4 w-full text-left">Yearly Expenditure</Text>
            {yearlyStats.expense.length > 0 ? (
              <>
                <PieChart
                  data={yearlyStats.expense}
                  donut
                  showText={false}
                  radius={80}
                  innerRadius={60}
                  innerCircleColor={innerCircleColor}
                  centerLabelComponent={() => {
                    return (
                      <View className="items-center justify-center">
                        <Text className="text-slate-900 dark:text-white text-xs font-bold">Total</Text>
                        <Text className="text-slate-500 dark:text-slate-400 text-[10px]">{formatCurrency(yearlyStats.totalExpense)}</Text>
                      </View>
                    );
                  }}
                />
                {renderLegend(yearlyStats.expense)}
              </>
            ) : (
              <Text className="text-slate-400 dark:text-slate-500 py-8">No expense data for {currentYear}</Text>
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
