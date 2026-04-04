import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { PieChart } from "react-native-gifted-charts";
import Animated from 'react-native-reanimated';
import { getTransactions, initDatabase, subscribeToDatabaseChanges } from '../../services/database';
import { ForecastResult, forecastService } from '../../services/forecastService';
import { IncomeLog, incomeService } from '../../services/incomeService';
import { CategoryTrend, KeyMetrics, insightsService } from '../../services/insightsService';
import { Transaction } from '../../types/transaction';



import { router } from 'expo-router';
import { useColorScheme } from "nativewind";

export default function AnalyticsScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const innerCircleColor = isDark ? '#1e293b' : '#ffffff';
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [logs, setLogs] = useState<IncomeLog[]>([]);

  // Phase 5 intelligence state
  const [metrics, setMetrics] = useState<KeyMetrics | null>(null);
  const [trends, setTrends] = useState<CategoryTrend[]>([]);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [insightsTab, setInsightsTab] = useState<'overview' | 'trends' | 'forecast'>('overview');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      await initDatabase();
      const allTransactions = await getTransactions();
      setTransactions(allTransactions);

      // Load intelligence data in parallel
      try {
        const [kMetrics, kTrends, kForecast, fetchedLogs] = await Promise.all([
          insightsService.getKeyMetrics('local_user', allTransactions),
          insightsService.getCategoryTrends(allTransactions),
          forecastService.forecast(allTransactions),
          incomeService.getLogs(),
        ]);
        setMetrics(kMetrics);
        setTrends(kTrends);
        setForecast(kForecast);
        setLogs(fetchedLogs);
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
      if (t.isDeleted) return false;
      const txDate = t.date instanceof Date ? t.date : new Date(t.date);
      if (isNaN(txDate.getTime())) return false;
      return isSameMonth(txDate, selectedDate);
    });
  }, [transactions, selectedDate]);

  // Calculate statistics
  const { thisMonthTotal } = useMemo(() => {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisTotal = logs.filter(l => new Date(l.receivedAt) >= startOfThisMonth).reduce((sum, l) => sum + l.amount, 0);
    return { thisMonthTotal: thisTotal };
  }, [logs]);

  //  old method   
  const stats = useMemo(() => {
    const income = filteredTransactions.filter(t => t.type === 'RECEIVED').reduce((sum, t) => sum + t.amount, 0);

    const expense = filteredTransactions.filter(t => t.type === 'SENT').reduce((sum, t) => sum + t.amount, 0);

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
      if (t.isDeleted) return false;
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
      <View className="flex-row flex-wrap gap-2 mt-4 justify-left">
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
      className="flex-1 bg-gray-50 dark:bg-[#020617]"
      contentContainerStyle={{ paddingBottom: 120 }}
      // onScroll={handleScroll}
      scrollEventThrottle={16}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#fff' : '#000'} />}
    >
      <StatusBar style="light" />

      {/* ── INTELLIGENCE INSIGHTS SECTION ── */}
      {metrics && (
        <View className="mx-4 mt-16 mb-6">
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
              {/* Key metric cards */}
              <View className="flex-row gap-3 mb-3">
                {/* Savings Rate */}
                <View className="app-card-muted flex-1 p-4">
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="w-8 h-8 rounded-xl items-center justify-center" style={{ backgroundColor: `${getSavingsRateColor(metrics.savingsRate)}20` }}>
                      <FontAwesome name="leaf" size={12} color={getSavingsRateColor(metrics.savingsRate)} />
                    </View>
                    <FontAwesome name={metrics.savingsRate >= 15 ? 'arrow-up' : 'arrow-down'} size={10} color={getSavingsRateColor(metrics.savingsRate)} />
                  </View>
                  <Text className="text-2xl font-bold text-slate-900 dark:text-white">{metrics.savingsRate.toFixed(1)}%</Text>
                  <Text className="text-slate-400 text-xs mt-0.5">Savings Rate</Text>
                </View>

                {/* Debt-to-Income */}
                <View className="app-card-muted flex-1 p-4">
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="w-8 h-8 rounded-xl items-center justify-center" style={{ backgroundColor: `${getDTIColor(metrics.debtToIncomeRatio)}20` }}>
                      <FontAwesome name="balance-scale" size={12} color={getDTIColor(metrics.debtToIncomeRatio)} />
                    </View>
                    <FontAwesome name={metrics.debtToIncomeRatio <= 30 ? 'arrow-down' : 'arrow-up'} size={10} color={getDTIColor(metrics.debtToIncomeRatio)} />
                  </View>
                  <Text className="text-2xl font-bold text-slate-900 dark:text-white">{metrics.debtToIncomeRatio.toFixed(0)}%</Text>
                  <Text className="text-slate-400 text-xs mt-0.5">Debt-to-Income</Text>
                </View>

                {/* Spending Velocity */}
                <View className="app-card-muted flex-1 p-4">
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="w-8 h-8 rounded-xl items-center justify-center bg-orange-50 dark:bg-orange-900/20">
                      <FontAwesome name="bolt" size={12} color="#f97316" />
                    </View>
                    <FontAwesome name={metrics.spendingVelocity <= metrics.lastMonthVelocity ? 'arrow-down' : 'arrow-up'} size={10} color={metrics.spendingVelocity <= metrics.lastMonthVelocity ? '#10b981' : '#ef4444'} />
                  </View>
                  <Text className="text-xl font-bold text-slate-900 dark:text-white">{Math.round(metrics.spendingVelocity / 1000).toFixed(0)}K</Text>
                  <Text className="text-slate-400 text-xs mt-0.5">KES/day</Text>
                </View>
              </View>

              {/* Net Worth Card */}
              <View className={`p-5 rounded-[12px] mb-3 overflow-hidden relative ${metrics.netWorth >= 0
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

              {/* Savings Progress */}
              {metrics.totalSavingsTarget > 0 && (
                <View className="app-card-muted p-5">
                  <View className="flex-row justify-between items-center mb-3">
                    <Text className="font-bold text-slate-900 dark:text-white">Savings Goals</Text>
                    <Text className="text-slate-400 text-xs">{metrics.savingsProgress.toFixed(0)}% achieved</Text>
                  </View>
                  <View className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <View
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, metrics.savingsProgress)}%`, backgroundColor: '#10b981' }}
                    />
                  </View>
                  <View className="flex-row justify-between mt-2">
                    <Text className="text-slate-400 text-xs">KES {metrics.totalSaved.toLocaleString()} saved</Text>
                    <Text className="text-slate-400 text-xs">of KES {metrics.totalSavingsTarget.toLocaleString()}</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── TRENDS TAB ── */}
          {insightsTab === 'trends' && (
            <View className="app-card-muted p-5">
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
            <View className="gap-3">
              {/* Main forecast card */}
              <View className="app-card-muted p-5">
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

                <View className="bg-slate-50 dark:bg-slate-800/50 rounded-[12px] p-4 gap-3">
                  <View className="flex-row justify-between">
                    <Text className="text-slate-500 text-xs">Projected Income</Text>
                    <Text className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">KES {forecast.projectedIncome.toLocaleString()}</Text>
                  </View>
                  <View className="flex-row justify-between border-t border-slate-100 dark:border-slate-700 pt-2">
                    <Text className="text-slate-500 text-xs">Projected Savings</Text>
                    <Text className={`font-bold text-xs ${forecast.projectedSavings >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      {forecast.projectedSavings >= 0 ? '+' : ''}KES {forecast.projectedSavings.toLocaleString()}
                    </Text>
                  </View>
                  <View className="flex-row justify-between border-t border-slate-100 dark:border-slate-700 pt-2">
                    <Text className="text-slate-500 text-xs">Based on</Text>
                    <Text className="text-slate-700 dark:text-slate-300 font-bold text-xs">{forecast.monthlyDataPoints} months of data</Text>
                  </View>
                </View>
              </View>

              {/* Days until exhaustion */}
              {forecast.daysUntilExhaustion !== null && (
                <View className="p-5 rounded-[12px] bg-amber-50 dark:bg-amber-900/20">
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
      <View className="app-card-muted m-4 px-4 py-4">
        <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Total Expense • {formatMonth(selectedDate)}</Text>
        <Text className="text-slate-900 dark:text-white text-xl font-bold mb-6">
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
                className={`px-3 py-1 rounded-[8px] border ${isSelected
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
                <Text className={`text-[10px] text-center ${isSelected
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
          {/*income card*/}
          <TouchableOpacity onPress={() => router.push('/(tabs)/income')}>
            <View className="app-card flex-1 p-4">
              <View className="flex-row items-center mb-2">
                <Image
                  source={require('../../assets/svg/income.svg')}
                  style={{ width: 20, height: 20 }}
                  tintColor={"#10b981"}
                  contentFit="contain"
                />
                <Text className="text-slate-600 dark:text-slate-400 text-xs ml-4">Income</Text>
              </View>
              <Text className="text-green-600 dark:text-green-400 text-2xl font-bold">KES {thisMonthTotal.toLocaleString()}</Text>
            </View>
          </TouchableOpacity>
          <View className="app-card flex-1 p-4">
            <View className="flex-row items-center mb-2">
              <Image
                source={require('../../assets/svg/expense.svg')}
                style={{ width: 22, height: 22 }}
                tintColor={"#ef4444"}
                contentFit="contain"
              />
              <Text className="text-slate-600 dark:text-slate-400 text-xs ml-4">Expense</Text>
            </View>
            <Text className="text-red-600 dark:text-red-400 text-2xl font-bold">{formatCurrency(stats.expense)}</Text>
          </View>
        </View>

        <View className="app-card p-4 rounded-[12px]">
          <View className="flex-row items-center justify-between">
            <Text className="text-slate-600 dark:text-slate-400 text-sm">Net Balance</Text>
            <Text className={`text-2xl font-bold ${stats.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatCurrency(thisMonthTotal - stats.expense)}
            </Text>
          </View>
        </View>
      </View>



      {/* Spending by Category */}
      <View className="px-6 mt-8">
        <Text className="text-slate-900 dark:text-white text-lg font-bold mb-4">Spending by Category</Text>
        {stats.categories.length > 0 ? (
          <View className="app-card p-4">
            {stats.categories.slice(0, 8).map((cat, index) => (
              <View key={index} className="mb-4">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center flex-1">
                    <View className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: cat.color }} />
                    <Text className="text-slate-900 dark:text-slate-300 text-sm font-medium flex-1">{cat.name}</Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-xs mr-4">{cat.percentage.toFixed(1)}% of total</Text>
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
              </View>
            ))}
          </View>
        ) : (
          <View className="app-card p-8 items-center">
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
                  className="flex-row items-center bg-orange-50 dark:bg-orange-900/20 p-4 rounded-[12px] border border-orange-100 dark:border-orange-800/50"
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

        <View className="flex-row gap-4">

          {/* Income Card */}
          <View className="app-card-muted flex-1 p-5">

            <Text className="text-xs uppercase tracking-widest font-bold text-slate-500 dark:text-slate-400 mb-3 text-center">
              Yearly Income
            </Text>

            {yearlyStats.income.length > 0 ? (
              <>
                <View className="items-center justify-center mb-4">
                  <PieChart
                    data={yearlyStats.income}
                    donut
                    radius={65}
                    innerRadius={45}
                    focusOnPress
                    animationDuration={600}
                    strokeWidth={3}
                    strokeColor={isDark ? "#0f172a" : "#ffffff"}
                    innerCircleColor={innerCircleColor}
                    centerLabelComponent={() => (
                      <View className="items-center">
                        <Text className="text-[12px] font-bold text-slate-900 dark:text-white">
                          {formatCurrency(yearlyStats.totalIncome)}
                        </Text>
                        <Text className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          Total
                        </Text>
                      </View>
                    )}
                  />
                </View>

                <View className="mt-2 align-left">
                  {renderLegend(yearlyStats.income)}
                </View>
              </>
            ) : (
              <View className="py-10 items-center">
                <Text className="text-slate-400 dark:text-slate-500 text-sm">
                  No income data for {currentYear}
                </Text>
              </View>
            )}
          </View>

          {/* Expense Card */}
          <View className="app-card-muted flex-1 p-5">

            <Text className="text-xs uppercase tracking-widest font-bold text-slate-500 dark:text-slate-400 mb-3 text-center">
              Yearly Expenditure
            </Text>

            {yearlyStats.expense.length > 0 ? (
              <>
                <View className="items-center justify-center mb-4">
                  <PieChart
                    data={yearlyStats.expense}
                    donut
                    radius={65}
                    innerRadius={45}
                    focusOnPress
                    animationDuration={600}
                    strokeWidth={3}
                    strokeColor={isDark ? "#0f172a" : "#ffffff"}
                    innerCircleColor={innerCircleColor}
                    centerLabelComponent={() => (
                      <View className="items-center">
                        <Text className="text-lg font-bold text-slate-900 dark:text-white">
                          {formatCurrency(yearlyStats.totalExpense)}
                        </Text>
                        <Text className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          Total
                        </Text>
                      </View>
                    )}
                  />
                </View>

                <View className="text-left">
                  {renderLegend(yearlyStats.expense)}
                </View>
              </>
            ) : (
              <View className="py-10 items-center">
                <Text className="text-slate-400 dark:text-slate-500 text-sm">
                  No expense data for {currentYear}
                </Text>
              </View>
            )}
          </View>

        </View>
      </View>
    </Animated.ScrollView>
  );
}
