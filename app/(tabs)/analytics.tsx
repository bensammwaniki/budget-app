import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { PieChart } from "react-native-gifted-charts";
import Animated from 'react-native-reanimated';
import { useAuth } from '../../services/AuthContext';
import { getTransactions, initDatabase, subscribeToDatabaseChanges } from '../../services/database';
import {
  getFinancialMonthRange,
  getFinancialSettings,
  isCashflowTransaction,
  isInternalTransfer,
} from '../../services/financialSettingsService';
import { ForecastResult, forecastService } from '../../services/forecastService';
import { CategoryTrend, KeyMetrics, insightsService } from '../../services/insightsService';
import { Transaction } from '../../types/transaction';

import { useColorScheme } from "nativewind";

export default function AnalyticsScreen() {
  const { phoneNumber } = useAuth();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const innerCircleColor = isDark ? '#1e293b' : '#ffffff';
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [financialMonthStart, setFinancialMonthStart] = useState(1);
  const [hideInternalTransfers, setHideInternalTransfers] = useState(false);


  // Phase 5 intelligence state
  const [metrics, setMetrics] = useState<KeyMetrics | null>(null);
  const [trends, setTrends] = useState<CategoryTrend[]>([]);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [insightsTab, setInsightsTab] = useState<'overview' | 'trends' | 'forecast'>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedYearlyIncome, setSelectedYearlyIncome] = useState<{ value: number; text: string } | null>(null);
  const [selectedYearlyExpense, setSelectedYearlyExpense] = useState<{ value: number; text: string } | null>(null);


  const loadData = useCallback(async () => {
    try {
      await initDatabase();
      const [allTransactions, financialSettings] = await Promise.all([
        getTransactions(),
        getFinancialSettings(),
      ]);
      setTransactions(allTransactions);
      setFinancialMonthStart(financialSettings.monthStartDay);
      setHideInternalTransfers(financialSettings.hideInternalTransfers);

      // Load intelligence data in parallel
      try {
        const [kMetrics, kTrends, kForecast] = await Promise.all([
          insightsService.getKeyMetrics('local_user', allTransactions),
          insightsService.getCategoryTrends(allTransactions),
          forecastService.forecast(allTransactions),
        ]);
        setMetrics(kMetrics);
        setTrends(kTrends);
        setForecast(kForecast);
      } catch (e) {
        console.warn('Insights load failed:', e);
      }
    } catch (error) {
      console.error('Failed to load analytics data:', error);
    }
  }, []);

  useEffect(() => {
    loadData();

    const unsubscribe = subscribeToDatabaseChanges((type) => {
      if (type === 'TRANSACTIONS' || type === 'INCOME_LOGS' || type === 'INCOME_SOURCES' || type === 'CATEGORIES') {
        loadData();
      }
    });

    return unsubscribe;
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const selectedMonthRange = useMemo(
    () => getFinancialMonthRange(selectedDate, financialMonthStart),
    [financialMonthStart, selectedDate]
  );

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (t.isDeleted) return false;
      if (hideInternalTransfers && isInternalTransfer(t, { userPhoneNumber: phoneNumber })) return false;
      const txDate = t.date instanceof Date ? t.date : new Date(t.date);
      if (isNaN(txDate.getTime())) return false;
      return txDate >= selectedMonthRange.start && txDate <= selectedMonthRange.end;
    });
  }, [hideInternalTransfers, phoneNumber, selectedMonthRange.end, selectedMonthRange.start, transactions]);

  // Selected-period summary. Income, expense, and net intentionally share the
  // same date-filtered set so changing month updates all three together.
  const stats = useMemo(() => {
    const cashflowTransactions = filteredTransactions.filter(t => isCashflowTransaction(t, { userPhoneNumber: phoneNumber }));
    const income = cashflowTransactions.filter(t => t.type === 'RECEIVED').reduce((sum, t) => sum + t.amount, 0);

    const expense = cashflowTransactions.filter(t => t.type === 'SENT').reduce((sum, t) => sum + t.amount, 0);

    // Category breakdown
    const categoryMap: Record<string, { amount: number; color: string; count: number; icon: string }> = {};
    cashflowTransactions
      .filter(t => t.type === 'SENT')
      .forEach(t => {
        const cat = t.categoryName || 'Uncategorized';
        if (!categoryMap[cat]) {
          categoryMap[cat] = { amount: 0, color: t.categoryColor || '#64748b', count: 0, icon: t.categoryIcon || 'tag' };
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
        icon: data.icon,
        percentage: expense > 0 ? (data.amount / expense) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      income,
      expense,
      net: income - expense,
      categories,
      avgTransaction: cashflowTransactions.filter(t => t.type === 'SENT').length > 0 ? expense / cashflowTransactions.filter(t => t.type === 'SENT').length : 0
    };
  }, [filteredTransactions, phoneNumber]);

  const currentYear = new Date().getFullYear();

  const yearlyStats = useMemo(() => {
    const yearlyTransactions = transactions.filter(t => {
      if (t.isDeleted) return false;
      if (!isCashflowTransaction(t, { userPhoneNumber: phoneNumber })) return false;
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
  }, [currentYear, phoneNumber, transactions]);





  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatMonth = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const getSavingsRateColor = (rate: number) => {
    if (rate >= 30) return '#10b981';
    if (rate >= 15) return '#f59e0b';
    return '#ef4444';
  };

  const getDTIColor = (dti: number) => {
    if (dti <= 30) return '#10b981';
    if (dti <= 50) return '#f59e0b';
    return '#ef4444';
  };

  const getConfidenceColor = (c: string) => {
    if (c === 'HIGH') return '#10b981';
    if (c === 'MEDIUM') return '#f59e0b';
    return '#ef4444';
  };

  const INSIGHTS_TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'trends', label: 'Trends' },
    { key: 'forecast', label: 'Forecast' },
  ] as const;

  return (
    <Animated.ScrollView
      className="flex-1 app-screen"
      contentContainerStyle={{ paddingBottom: 120 }}
      // onScroll={handleScroll}
      scrollEventThrottle={16}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#fff' : '#000'} />}
    >
      <StatusBar style="light" />

      {/* ── INTELLIGENCE INSIGHTS SECTION ── */}
      {metrics && (
        <View className="mx-4 mt-12 mb-4">
          {/* Section header */}
          <View className="flex-row justify-between items-center mb-4">
            <View>
              <Text className="text-2xl font-bold text-slate-900 dark:text-white">Insights</Text>
              <Text className="text-slate-400 text-xs mt-0.5">Your financial picture</Text>
            </View>
            <View style={{ flexDirection: 'row', backgroundColor: isDark ? '#1e293b' : '#f1f5f9', padding: 4, borderRadius: 24, gap: 4 }}>
              {INSIGHTS_TABS.map(t => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setInsightsTab(t.key)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 24,
                    backgroundColor: insightsTab === t.key ? (isDark ? '#334155' : '#ffffff') : 'transparent',
                    shadowColor: insightsTab === t.key ? '#000' : 'transparent',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.03,
                    shadowRadius: 1,
                    elevation: insightsTab === t.key ? 1 : 0
                  }}
                >
                  <Text style={{
                    fontSize: 10,
                    fontWeight: 'bold',
                    color: insightsTab === t.key ? (isDark ? '#ffffff' : '#0f172a') : '#94a3b8'
                  }}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── OVERVIEW TAB ── */}
          {insightsTab === 'overview' && (
            <View>
              {/* Unified Metrics Card */}
              <View className="app-card mb-4 flex-row py-4 px-2">
                {/* Savings Rate */}
                <View className="flex-1 items-center border-r border-slate-50 dark:border-slate-800/50">
                  <Text className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Savings Rate</Text>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-sm font-bold text-slate-900 dark:text-white">{metrics.savingsRate.toFixed(1)}%</Text>
                    <FontAwesome 
                      name={metrics.savingsRate >= 15 ? 'arrow-up' : 'arrow-down'} 
                      size={8} 
                      color={getSavingsRateColor(metrics.savingsRate)} 
                    />
                  </View>
                </View>

                {/* Debt-to-Income */}
                <View className="flex-1 items-center border-r border-slate-50 dark:border-slate-800/50">
                  <Text className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">DTI Ratio</Text>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-sm font-bold text-slate-900 dark:text-white">{metrics.debtToIncomeRatio.toFixed(0)}%</Text>
                    <FontAwesome 
                      name={metrics.debtToIncomeRatio <= 30 ? 'arrow-down' : 'arrow-up'} 
                      size={8} 
                      color={getDTIColor(metrics.debtToIncomeRatio)} 
                    />
                  </View>
                </View>

                {/* Spending Velocity */}
                <View className="flex-1 items-center">
                  <Text className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">KES/Day</Text>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-sm font-bold text-slate-900 dark:text-white">{Math.round(metrics.spendingVelocity / 1000).toFixed(0)}K</Text>
                    <FontAwesome 
                      name={metrics.spendingVelocity <= metrics.lastMonthVelocity ? 'arrow-down' : 'arrow-up'} 
                      size={8} 
                      color={metrics.spendingVelocity <= metrics.lastMonthVelocity ? '#10b981' : '#ef4444'} 
                    />
                  </View>
                </View>
              </View>

              {/* Net Worth Card */}
              <View className={`p-5 rounded-[16px] mb-4 overflow-hidden relative ${metrics.netWorth >= 0
                ? 'bg-emerald-600'
                : 'bg-red-600'
                }`}>
                <View className="absolute right-3 top-3 opacity-10">
                  <FontAwesome name="line-chart" size={80} color="white" />
                </View>
                <Text className="text-emerald-100 text-xs font-bold uppercase tracking-wider mb-1">Net Worth</Text>
                <Text className="text-white text-3xl font-bold mb-2">
                  {metrics.netWorth >= 0 ? '' : '-'}KES {Math.abs(metrics.netWorth).toLocaleString()}
                </Text>
                <View className="flex-row gap-4">
                  <View>
                    <Text className="text-white/60 text-xs">Assets</Text>
                    <Text className="text-white font-bold text-sm">KES {metrics.totalAssets.toLocaleString()}</Text>
                  </View>
                  <View>
                    <Text className="text-white/60 text-xs">Liabilities</Text>
                    <Text className="text-white font-bold text-sm">KES {metrics.totalLiabilities.toLocaleString()}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* ── TRENDS TAB ── */}
          {insightsTab === 'trends' && (
            <View className="app-card p-5">
              <Text className="text-slate-900 dark:text-white font-bold mb-1">Spending by Category</Text>
              <Text className="text-slate-400 text-xs mb-5">This month vs last month</Text>

              {trends.length === 0 ? (
                <View className="items-center py-6">
                  <FontAwesome name="bar-chart" size={40} color="#cbd5e1" />
                  <Text className="text-slate-400 mt-3 text-center text-sm">Not enough categorized data yet.</Text>
                </View>
              ) : (
                <View className="gap-3">
                  {trends.map((t, i) => {
                    const maxAmount = Math.max(...trends.map(x => Math.max(x.thisMonth, x.lastMonth)), 1);
                    const color = t.categoryColor || '#64748b';
                    return (
                      <View key={i}>
                        <View className="flex-row justify-between items-center mb-1">
                          <Text className="text-slate-700 dark:text-slate-300 font-medium text-xs flex-1" numberOfLines={1}>{t.categoryName}</Text>
                          <View className="flex-row gap-2 items-center">
                            {t.trend !== 0 && (
                              <FontAwesome
                                name={t.trend > 0 ? 'arrow-up' : 'arrow-down'}
                                size={8}
                                color={t.trend > 0 ? '#ef4444' : '#10b981'}
                              />
                            )}
                            <Text className="text-slate-900 dark:text-white font-bold text-xs">KES {t.thisMonth.toLocaleString()}</Text>
                          </View>
                        </View>
                        {/* This month bar */}
                        <View className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-1">
                          <View className="h-full rounded-full" style={{ width: `${(t.thisMonth / maxAmount) * 100}%`, backgroundColor: color }} />
                        </View>
                        {/* Last month bar */}
                        <View className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <View className="h-full rounded-full opacity-30" style={{ width: `${(t.lastMonth / maxAmount) * 100}%`, backgroundColor: color }} />
                        </View>
                        <Text className="text-slate-300 dark:text-slate-600 text-[10px] mt-0.5">
                          Last month: KES {t.lastMonth.toLocaleString()}
                        </Text>
                      </View>
                    );
                  })}
                  {/* Legend */}
                  <View className="flex-row gap-4 mt-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <View className="flex-row items-center gap-1">
                      <View className="w-4 h-3 rounded bg-slate-400" />
                      <Text className="text-slate-400 text-xs">This month</Text>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <View className="w-4 h-2 rounded bg-slate-300 opacity-40" />
                      <Text className="text-slate-400 text-xs">Last month</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── FORECAST TAB ── */}
          {insightsTab === 'forecast' && forecast && (
            <View className="gap-4">
              {/* Main forecast card */}
              <View className="app-card p-5">
                <View className="flex-row justify-between items-start mb-4">
                  <View>
                    <Text className="text-slate-400 text-xs">Projected Next Month</Text>
                    <Text className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
                      KES {forecast.projectedExpenses.toLocaleString()}
                    </Text>
                  </View>
                  <View className="app-pill" style={{ backgroundColor: `${getConfidenceColor(forecast.confidence)}20` }}>
                    <Text className="text-[9px] font-semibold" style={{ color: getConfidenceColor(forecast.confidence) }}>
                      {forecast.confidence} confidence
                    </Text>
                  </View>
                </View>

                <View className="bg-slate-50 dark:bg-[#0f172a] rounded-[16px] p-4 gap-3">
                  <View className="flex-row justify-between">
                    <Text className="text-slate-500 text-xs">Projected Income</Text>
                    <Text className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">KES {forecast.projectedIncome.toLocaleString()}</Text>
                  </View>
                  <View className="flex-row justify-between border-t border-slate-100 dark:border-slate-800 pt-2">
                    <Text className="text-slate-500 text-xs">Projected Savings</Text>
                    <Text className={`font-bold text-xs ${forecast.projectedSavings >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      {forecast.projectedSavings >= 0 ? '+' : ''}KES {forecast.projectedSavings.toLocaleString()}
                    </Text>
                  </View>
                  <View className="flex-row justify-between border-t border-slate-100 dark:border-slate-800 pt-2">
                    <Text className="text-slate-500 text-xs">Based on</Text>
                    <Text className="text-slate-700 dark:text-slate-300 font-bold text-xs">{forecast.monthlyDataPoints} months of data</Text>
                  </View>
                </View>
              </View>

              {/* Days until exhaustion */}
              {forecast.daysUntilExhaustion !== null && (
                <View className="p-5 rounded-[16px] bg-amber-50 dark:bg-amber-900/20">
                  <View className="flex-row items-center gap-3">
                    <View className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 items-center justify-center">
                      <FontAwesome name="clock-o" size={18} color="#f59e0b" />
                    </View>
                    <View className="flex-1">
                      <Text className="font-bold text-amber-900 dark:text-amber-200">
                        ~{forecast.daysUntilExhaustion} days remaining
                      </Text>
                      <Text className="text-amber-600 dark:text-amber-400 text-xs mt-0.5">
                        At your current spend rate, you&apos;ll reach this month&apos;s projected budget in {forecast.daysUntilExhaustion} days
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* Header */}
      <View className="app-card m-4 px-4 py-4 mb-4">
        <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Total Expense • {formatMonth(selectedDate)}</Text>
        <Text className="text-slate-900 dark:text-white text-xl font-bold mb-6">
          {formatCurrency(stats.expense)}
        </Text>



        {/* Summary Metrics Row */}
        <View className="flex-row items-center border-t border-slate-50 dark:border-slate-800/50 -mx-4 pt-4 px-4 pb-4">
          <View className="flex-1 items-center border-r border-slate-100 dark:border-slate-800/50">
            <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1 text-center">Income</Text>
            <Text className="text-green-600 dark:text-green-500 font-bold text-sm">KES {stats.income.toLocaleString()}</Text>
          </View>
          <View className="flex-1 items-center border-r border-slate-100 dark:border-slate-800/50">
            <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1 text-center">Net Balance</Text>
            <Text className={`font-bold text-sm ${stats.net >= 0 ? 'text-blue-600 dark:text-blue-500' : 'text-red-500'}`}>
              KES {Math.abs(stats.net).toLocaleString()}
            </Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1 text-center">Expense</Text>
            <Text className="text-red-600 dark:text-red-500 font-bold text-sm">KES {stats.expense.toLocaleString()}</Text>
          </View>
        </View>

        {/* Date Selector / Navigation */}
        <View className="flex-row items-center justify-between border-t border-slate-50 dark:border-slate-800/50 pt-4 mb-4 mx-0">
          <TouchableOpacity
            onPress={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1))}
            className="w-10 h-10 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-800/50"
          >
            <FontAwesome name="chevron-left" size={12} color={isDark ? '#94a3b8' : '#64748b'} />
          </TouchableOpacity>

          <Text className="text-slate-900 dark:text-white font-bold">{formatMonth(selectedDate)}</Text>

          <TouchableOpacity
            onPress={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1))}
            className="w-10 h-10 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-800/50"
          >
            <FontAwesome name="chevron-right" size={12} color={isDark ? '#94a3b8' : '#64748b'} />
          </TouchableOpacity>
        </View>

        {/* Spending by Category - Merged into card */}
        <View className="border-t border-slate-50 dark:border-slate-800/50 -mx-4">
          <View className="px-4 py-3 bg-slate-50/50 dark:bg-slate-800/30">
            <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest">Spending by Category</Text>
          </View>
          {stats.categories.length === 0 ? (
            <View className="p-8 items-center justify-center">
              <Text className="text-slate-400 text-sm">No transaction data for this period</Text>
            </View>
          ) : (
            <>
              {stats.categories.map((cat, index) => (
                <View
                  key={cat.name}
                  className={`flex-row items-center p-3 ${index !== stats.categories.length - 1 ? 'border-b border-slate-50 dark:border-slate-800/50' : ''
                    }`}
                >
                  <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: `${cat.color}20` }}>
                    <FontAwesome name={cat.icon as any} size={12} color={cat.color} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-900 dark:text-white font-semibold mb-1 text-[13px]">{cat.name}</Text>
                    <View className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <View
                        className="h-full rounded-full"
                        style={{
                          backgroundColor: cat.color,
                          width: `${(cat.amount / stats.expense) * 100}%`
                        }}
                      />
                    </View>
                  </View>
                  <View className="items-end ml-4">
                    <Text className="text-slate-900 dark:text-white font-bold mb-1 text-[13px]">{formatCurrency(cat.amount)}</Text>
                    <Text className="text-slate-400 text-[9px] uppercase font-bold tracking-wider">
                      {((cat.amount / stats.expense) * 100).toFixed(0)}%
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </View>
      </View>

      {/* Monthly Fuliza Fees - Only displayed if there are fees */}
      {filteredTransactions.some(t => t.id.startsWith('FULIZA-FEES-')) && (
        <View className="px-4 mt-8 mb-4">
          <View className="app-card p-5">
            <Text className="text-slate-900 dark:text-white text-base font-bold mb-4">Monthly Fuliza Fees</Text>
            <View className="gap-4">
              {filteredTransactions
                .filter(t => t.id.startsWith('FULIZA-FEES-'))
                .map((tx) => (
                  <View
                    key={tx.id}
                    className="flex-row items-center bg-orange-50 dark:bg-orange-900/20 p-4 rounded-[16px] border border-orange-100 dark:border-orange-800/50"
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
        </View>
      )}

      {/* Yearly Overview Card - Combined */}
      <View className="px-4 mt-8 mb-8">
        <View className="app-card p-5">
          <Text className="text-slate-900 dark:text-white text-base font-bold mb-6">{currentYear} Overview</Text>
          <View className="flex-row">
            {/* Yearly Income Section */}
            <View className="flex-1 items-center">
              <Text className="text-[10px] uppercase tracking-widest font-bold text-slate-500 dark:text-slate-400 mb-6 text-center">
                Income Log
              </Text>
              {yearlyStats.income.length > 0 ? (
                <PieChart
                  data={yearlyStats.income}
                  donut
                  radius={70}
                  innerRadius={40}
                  onPress={(item: any) => setSelectedYearlyIncome(item)}
                  animationDuration={600}
                  strokeWidth={2}
                  strokeColor={isDark ? "#0f172a" : "#ffffff"}
                  innerCircleColor={innerCircleColor}
                  centerLabelComponent={() => (
                    <View className="items-center px-1">
                      <Text className="text-[11px] font-bold text-slate-900 dark:text-white text-center" numberOfLines={1}>
                        {selectedYearlyIncome ? formatCurrency(selectedYearlyIncome.value) : formatCurrency(yearlyStats.totalIncome)}
                      </Text>
                      <Text className="text-[8px] uppercase tracking-tighter text-slate-500 dark:text-slate-400 text-center" numberOfLines={1}>
                        {selectedYearlyIncome ? selectedYearlyIncome.text : 'Total'}
                      </Text>
                    </View>
                  )}
                />
              ) : (
                <View className="py-6 items-center">
                  <Text className="text-slate-400 text-[10px]">No income data</Text>
                </View>
              )}
            </View>

            {/* Vertical Divider */}
            <View className="w-[1px] bg-slate-50 dark:bg-slate-800/50 mx-2" />

            {/* Yearly Expense Section */}
            <View className="flex-1 items-center">
              <Text className="text-[10px] uppercase tracking-widest font-bold text-slate-500 dark:text-slate-400 mb-6 text-center">
                Expenditure
              </Text>
              {yearlyStats.expense.length > 0 ? (
                <PieChart
                  data={yearlyStats.expense}
                  donut
                  radius={70}
                  innerRadius={40}
                  onPress={(item: any) => setSelectedYearlyExpense(item)}
                  animationDuration={600}
                  strokeWidth={1}
                  strokeColor={isDark ? "#0f172a" : "#ffffff"}
                  innerCircleColor={innerCircleColor}
                  centerLabelComponent={() => (
                    <View className="items-center px-1">
                      <Text className="text-[11px] font-bold text-slate-900 dark:text-white text-center" numberOfLines={1}>
                        {selectedYearlyExpense ? formatCurrency(selectedYearlyExpense.value) : formatCurrency(yearlyStats.totalExpense)}
                      </Text>
                      <Text className="text-[8px] uppercase tracking-tighter text-slate-500 dark:text-slate-400 text-center" numberOfLines={1}>
                        {selectedYearlyExpense ? selectedYearlyExpense.text : 'Total'}
                      </Text>
                    </View>
                  )}
                />
              ) : (
                <View className="py-6 items-center">
                  <Text className="text-slate-400 text-[10px]">No expense data</Text>
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity 
            onPress={() => {
              setSelectedYearlyIncome(null);
              setSelectedYearlyExpense(null);
            }}
            className="mt-6 py-2 items-center border-t border-slate-50 dark:border-slate-800/50"
          >
            <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Tap chart to inspect • Reset View</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.ScrollView>
  );
}
