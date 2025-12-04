import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { BarChart, PieChart, LineChart } from 'react-native-gifted-charts';
import { getTransactions } from '../../services/database';
import { Transaction } from '../../types/transaction';

type Period = 'THIS_MONTH' | 'LAST_MONTH';

const screenWidth = Dimensions.get('window').width;

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

  // 1. Income vs Expense for selected period
  const incomeVsExpense = useMemo(() => {
    const income = filteredTransactions
      .filter(t => t.type === 'RECEIVED')
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = filteredTransactions
      .filter(t => t.type === 'SENT')
      .reduce((sum, t) => sum + t.amount, 0);
    return { income, expense };
  }, [filteredTransactions]);

  // 2. Expense Breakdown by Category
  const categoryBreakdown = useMemo(() => {
    const expenses = filteredTransactions.filter(t => t.type === 'SENT');
    const total = expenses.reduce((sum, t) => sum + t.amount, 0);

    const grouped: Record<string, { amount: number; color: string }> = {};
    expenses.forEach(t => {
      const cat = t.categoryName || 'Uncategorized';
      if (!grouped[cat]) {
        grouped[cat] = { amount: 0, color: t.categoryColor || '#64748b' };
      }
      grouped[cat].amount += t.amount;
    });

    return Object.entries(grouped)
      .map(([name, data]) => ({
        value: data.amount,
        text: name,
        color: data.color,
        percentage: total > 0 ? (data.amount / total) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [filteredTransactions]);

  // 3. Savings Tracker (categories with "saving" in name/description)
  const savingsData = useMemo(() => {
    const savingsTransactions = filteredTransactions.filter(t =>
      t.categoryName?.toLowerCase().includes('saving') ||
      t.categoryDescription?.toLowerCase().includes('saving')
    );
    const totalSavings = savingsTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = filteredTransactions
      .filter(t => t.type === 'SENT')
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      total: totalSavings,
      percentage: totalExpense > 0 ? (totalSavings / totalExpense) * 100 : 0
    };
  }, [filteredTransactions]);

  // 4. Yearly Trend (monthly data for current year)
  const yearlyTrend = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const monthlyData: { month: string; income: number; expense: number }[] = [];

    for (let i = 0; i < 12; i++) {
      const monthTransactions = transactions.filter(t => {
        const txDate = t.date instanceof Date ? t.date : new Date(t.date);
        return txDate.getFullYear() === currentYear && txDate.getMonth() === i;
      });

      const income = monthTransactions
        .filter(t => t.type === 'RECEIVED')
        .reduce((sum, t) => sum + t.amount, 0);
      const expense = monthTransactions
        .filter(t => t.type === 'SENT')
        .reduce((sum, t) => sum + t.amount, 0);

      monthlyData.push({
        month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
        income,
        expense
      });
    }

    return monthlyData;
  }, [transactions]);

  // 5. Weekly Spending (last 4 weeks)
  const weeklySpending = useMemo(() => {
    const now = new Date();
    const weeks: { label: string; value: number }[] = [];

    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (i * 7 + 7));
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() - (i * 7));

      const weekExpense = transactions
        .filter(t => {
          const txDate = t.date instanceof Date ? t.date : new Date(t.date);
          return t.type === 'SENT' && txDate >= weekStart && txDate < weekEnd;
        })
        .reduce((sum, t) => sum + t.amount, 0);

      weeks.push({
        label: `W${4 - i}`,
        value: weekExpense
      });
    }

    return weeks;
  }, [transactions]);

  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
  };

  return (
    <ScrollView className="flex-1 bg-[#020617]">
      <StatusBar style="light" />

      {/* Header */}
      <View className="px-6 pt-16 pb-8 bg-[#0f172a] rounded-b-[32px] border-b border-slate-800 shadow-lg">
        <Text className="text-slate-400 text-sm font-medium mb-1">Analytics Dashboard</Text>
        <Text className="text-white text-4xl font-bold mb-4">{formatCurrency(incomeVsExpense.expense)}</Text>

        {/* Period Selector */}
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

      {/* 1. Income vs Expense Bar Chart */}
      <View className="px-6 mt-8">
        <Text className="text-white text-lg font-bold mb-4">Income vs Expense</Text>
        <View className="bg-[#1e293b] p-4 rounded-2xl border border-slate-800">
          <BarChart
            data={[
              { value: incomeVsExpense.income, label: 'Income', frontColor: '#10b981' },
              { value: incomeVsExpense.expense, label: 'Expense', frontColor: '#ef4444' }
            ]}
            width={screenWidth - 80}
            height={120}
            barWidth={60}
            spacing={50}
            noOfSections={3}
            yAxisThickness={0}
            xAxisThickness={0}
            xAxisLabelTextStyle={{ color: '#94a3b8', fontSize: 12 }}
            yAxisTextStyle={{ color: '#94a3b8', fontSize: 10 }}
            hideRules
            showGradient
            gradientColor="#64748b20"
          />
          <View className="flex-row justify-around mt-4">
            <View className="items-center">
              <Text className="text-green-400 font-bold text-lg">{formatCurrency(incomeVsExpense.income)}</Text>
              <Text className="text-slate-400 text-xs">Income</Text>
            </View>
            <View className="items-center">
              <Text className="text-red-400 font-bold text-lg">{formatCurrency(incomeVsExpense.expense)}</Text>
              <Text className="text-slate-400 text-xs">Expense</Text>
            </View>
          </View>
        </View>
      </View>

      {/* 2. Expense Breakdown Pie Chart */}
      <View className="px-6 mt-8">
        <Text className="text-white text-lg font-bold mb-4">Spending by Category</Text>
        <View className="bg-[#1e293b] p-4 rounded-2xl border border-slate-800">
          {categoryBreakdown.length > 0 ? (
            <>
              <View className="items-center mb-4">
                <PieChart
                  data={categoryBreakdown}
                  donut
                  radius={80}
                  innerRadius={50}
                  centerLabelComponent={() => (
                    <View className="items-center">
                      <Text className="text-white font-bold text-lg">Total</Text>
                      <Text className="text-slate-400 text-xs">Expenses</Text>
                    </View>
                  )}
                />
              </View>
              <View className="gap-2">
                {categoryBreakdown.map((item, index) => (
                  <View key={index} className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1">
                      <View className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }} />
                      <Text className="text-slate-300 text-sm">{item.text}</Text>
                    </View>
                    <Text className="text-white font-semibold">{item.percentage.toFixed(1)}%</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View className="items-center py-8">
              <FontAwesome name="pie-chart" size={48} color="#334155" />
              <Text className="text-slate-500 mt-4">No expense data</Text>
            </View>
          )}
        </View>
      </View>

      {/* 3. Savings Tracker */}
      <View className="px-6 mt-8">
        <Text className="text-white text-lg font-bold mb-4">Savings Progress</Text>
        <View className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 p-6 rounded-2xl border border-green-800/50">
          <View className="flex-row items-center mb-4">
            <FontAwesome name="money" size={24} color="#10b981" />
            <Text className="text-white font-bold text-xl ml-3">Total Saved</Text>
          </View>
          <Text className="text-green-400 text-3xl font-bold mb-4">{formatCurrency(savingsData.total)}</Text>
          <View className="h-3 bg-slate-800 rounded-full overflow-hidden mb-2">
            <View
              className="h-full bg-green-500 rounded-full"
              style={{ width: `${Math.min(savingsData.percentage, 100)}%` }}
            />
          </View>
          <Text className="text-slate-400 text-xs">
            {savingsData.percentage.toFixed(1)}% of total expenses
          </Text>
        </View>
      </View>

      {/* 4. Yearly Trend Line Chart */}
      <View className="px-6 mt-8">
        <Text className="text-white text-lg font-bold mb-4">2025 Overview</Text>
        <View className="bg-[#1e293b] p-4 rounded-2xl border border-slate-800">
          <LineChart
            data={yearlyTrend.map((d, i) => ({ value: d.income, label: d.month }))}
            data2={yearlyTrend.map(d => ({ value: d.expense }))}
            width={screenWidth - 80}
            height={200}
            spacing={28}
            color1="#10b981"
            color2="#ef4444"
            thickness={2}
            startFillColor1="#10b98120"
            startFillColor2="#ef444420"
            endFillColor1="#10b98110"
            endFillColor2="#ef444410"
            areaChart
            curved
            yAxisColor="#64748b"
            xAxisColor="#64748b"
            yAxisTextStyle={{ color: '#94a3b8', fontSize: 10 }}
            xAxisLabelTextStyle={{ color: '#94a3b8', fontSize: 9, width: 30 }}
            hideRules
            noOfSections={4}
          />
          <View className="flex-row justify-center gap-6 mt-4">
            <View className="flex-row items-center">
              <View className="w-3 h-3 rounded-full bg-green-500 mr-2" />
              <Text className="text-slate-400 text-xs">Income</Text>
            </View>
            <View className="flex-row items-center">
              <View className="w-3 h-3 rounded-full bg-red-500 mr-2" />
              <Text className="text-slate-400 text-xs">Expense</Text>
            </View>
          </View>
        </View>
      </View>

      {/* 5. Weekly Spending Bar Chart */}
      <View className="px-6 mt-8 mb-8">
        <Text className="text-white text-lg font-bold mb-4">Weekly Spending</Text>
        <View className="bg-[#1e293b] p-4 rounded-2xl border border-slate-800">
          <BarChart
            data={weeklySpending}
            width={screenWidth - 80}
            height={150}
            barWidth={40}
            spacing={30}
            noOfSections={3}
            yAxisThickness={0}
            xAxisThickness={0}
            xAxisLabelTextStyle={{ color: '#94a3b8', fontSize: 12 }}
            yAxisTextStyle={{ color: '#94a3b8', fontSize: 10 }}
            hideRules
            showGradient
            gradientColor="#3b82f620"
            frontColor="#3b82f6"
          />
          <Text className="text-slate-400 text-xs text-center mt-3">Last 4 weeks spending trend</Text>
        </View>
      </View>
    </ScrollView>
  );
}
