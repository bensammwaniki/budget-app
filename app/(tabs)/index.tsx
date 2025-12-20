import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import CategorizationModal from '../../components/CategorizationModal';
import { HomeSkeleton, TransactionSkeleton } from '../../components/SkeletonLoader';
import { useSpendingSummary, useTransactions } from '../../hooks/useDatabase';
import { useAuth } from '../../services/AuthContext';
import {
  deleteTransaction,
  initDatabase, // Added
  saveRecipientCategory,
  updateFulizaFees,
  updateTransactionCategory,
  updateTransactionDate
} from '../../services/database';
import { useScrollVisibility } from '../../services/ScrollContext';
import { syncMessages } from '../../services/smsService';
import { Category, Transaction } from '../../types/transaction';
import { calculateFulizaDailyCharge } from '../../utils/fulizaCalculator';

type Period = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST 3 MONTHS' | 'CURRENT YEAR';

export default function HomeScreen() {
  const { user } = useAuth();
  const { colorScheme } = useColorScheme();
  const firstName = user?.displayName?.split(' ')[0] || 'User';
  const { showTabBar, hideTabBar } = useScrollVisibility();
  const lastScrollY = useSharedValue(0);

  // Use Reactive Hooks
  const { transactions: allTransactions, loading: txLoading } = useTransactions();
  const { summary: spending, loading: summaryLoading } = useSpendingSummary();

  const [selectedPeriod, setSelectedPeriod] = useState<Period>('THIS_MONTH');
  const [refreshing, setRefreshing] = useState(false);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(20); // Smaller initial limit for better fast-load
  const [loadingMore, setLoadingMore] = useState(false);

  // Categorization State
  const [modalVisible, setModalVisible] = useState(false);
  const [uncategorizedQueue, setUncategorizedQueue] = useState<Transaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // Derived state: Use selectedTransaction if set (Edit Mode), otherwise check queue (Queue Mode)
  const activeTransaction = selectedTransaction || (uncategorizedQueue.length > 0 ? uncategorizedQueue[0] : null);

  const initialLoading = txLoading && summaryLoading && allTransactions.length === 0;

  useEffect(() => {
    // Initial Sync in background - Quick Sync (7 days)
    const runQuickSync = async () => {
      try {
        await initDatabase();
        await syncMessages(7); // Quick Sync
        await updateFulizaFees();
      } catch (error) {
        console.error('Error in background quick sync:', error);
      }
    };
    runQuickSync();
  }, []);

  useEffect(() => {
    // Check for ALL uncategorized transactions (both SENT and RECEIVED)
    const uncategorized = allTransactions.filter(t => !t.categoryId);
    if (uncategorized.length > 0 && !modalVisible && !selectedTransaction) {
      setUncategorizedQueue(uncategorized);
      setModalVisible(true);
    }
  }, [allTransactions]);

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await syncMessages(30); // Full monthly sync on manual refresh
      await updateFulizaFees();
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Calculate date boundaries once
  const dateRange = useMemo(() => {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const startOfCurrentYear = new Date(now.getFullYear(), 0, 1);
    const startOfLast3Months = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    return { startOfThisMonth, startOfLastMonth, endOfLastMonth, startOfCurrentYear, startOfLast3Months };
  }, []);

  // Filter transactions based on selected period
  const filteredTransactions = useMemo(() => {
    return allTransactions.filter((t: Transaction) => {
      const txDate = t.date instanceof Date ? t.date : new Date(t.date);
      if (isNaN(txDate.getTime())) return false;

      const { startOfThisMonth, startOfLastMonth, endOfLastMonth, startOfCurrentYear, startOfLast3Months } = dateRange;

      if (selectedPeriod === 'THIS_MONTH') {
        return txDate >= startOfThisMonth;
      } else if (selectedPeriod === 'LAST_MONTH') {
        return txDate >= startOfLastMonth && txDate <= endOfLastMonth;
      } else if (selectedPeriod === 'LAST 3 MONTHS') {
        return txDate >= startOfLast3Months;
      } else if (selectedPeriod === 'CURRENT YEAR') {
        return txDate >= startOfCurrentYear;
      }
      return true;
    });
  }, [allTransactions, selectedPeriod, dateRange]);

  // Fuliza Fees for the selected period
  const periodFulizaFees = useMemo(() => {
    return filteredTransactions.filter(t => t.id.startsWith('FULIZA-FEES-'));
  }, [filteredTransactions]);

  // Calculate summary statistics for the selected period
  const periodSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    let cost = 0;
    let fulizaBalance = 0;

    filteredTransactions.forEach((t: Transaction) => {
      if (t.type === 'RECEIVED') {
        income += t.amount;
      } else {
        // SENT (includes Fuliza fees, transfers, etc.)
        expense += t.amount;
      }
      cost += t.transactionCost || 0;
    });

    // Only show Fuliza if:
    // 1. We're looking at THIS_MONTH (current month)
    // 2. The current balance is 0 or negative (meaning Fuliza is active)
    // For past periods, don't show Fuliza as it's not relevant to historical data
    if (selectedPeriod === 'THIS_MONTH' && spending?.currentBalance !== undefined && spending.currentBalance <= 0) {
      fulizaBalance = spending.fulizaOutstanding || 0;
    }

    return {
      income,
      expense,
      cost,
      fulizaBalance,
      net: income - expense
    };
  }, [filteredTransactions, spending, selectedPeriod]);





  const handleTransactionPress = (tx: Transaction) => {
    // Allow categorizing both SENT and RECEIVED transactions
    setSelectedTransaction(tx);
    setModalVisible(true);
  };

  const handleCategorySelect = async (category: Category) => {
    if (activeTransaction) {
      // Close modal immediately for "instant" feel
      if (selectedTransaction) {
        setModalVisible(false);
        setSelectedTransaction(null);
      } else {
        // Queue Mode: Move to next item immediately
        const newQueue = uncategorizedQueue.slice(1);
        setUncategorizedQueue(newQueue);
        if (newQueue.length === 0) {
          setModalVisible(false);
        }
      }

      // BACKGROUND: Perform DB operations
      try {
        // 1. Update the mapping for future transactions
        await saveRecipientCategory(activeTransaction.recipientId, category.id, activeTransaction.type);

        // 2. Update the specific transaction
        // This will trigger notifyListeners('TRANSACTIONS') in database.ts, 
        // which our hook is listening to, causing an automatic UI refresh.
        await updateTransactionCategory(activeTransaction.id, category.id);
      } catch (error) {
        console.error("Failed to save category:", error);
      }
    }
  };

  const handleDeleteTransaction = async (tx: Transaction) => {
    try {
      setModalVisible(false);
      setSelectedTransaction(null);

      // DB Operation (triggers notifyListeners)
      await deleteTransaction(tx.id);
    } catch (error) {
      console.error("Failed to delete transaction:", error);
      alert("Failed to delete transaction.");
    }
  };

  const handleDateChange = async (newDate: Date) => {
    if (activeTransaction) {
      try {
        setModalVisible(false);
        setSelectedTransaction(null);
        await updateTransactionDate(activeTransaction.id, newDate);
      } catch (error) {
        console.error("Failed to update date:", error);
      }
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedTransaction(null);
    // Note: Closing modal in Queue Mode skips the current item for now
  };

  const handleEndReached = () => {
    if (loadingMore || displayLimit >= filteredTransactions.length) return;

    setLoadingMore(true);
    // Simulate loading for shimmer effect
    setTimeout(() => {
      setDisplayLimit(prev => prev + 20);
      setLoadingMore(false);
    }, 800);
  };

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const currentY = event.contentOffset.y;
      const diff = currentY - lastScrollY.value;

      if (currentY <= 0) {
        hideTabBar();
      } else if (diff > 5) {
        showTabBar();
      }
      lastScrollY.value = currentY;
    },
  });

  if (initialLoading) {
    return <HomeSkeleton />;
  }

  const renderHeader = () => (
    <View>
      {/* Header */}
      <View className="px-6 pt-16 pb-8 bg-white dark:bg-[#0f172a] rounded-b-[32px] border-b border-gray-200 dark:border-slate-800 shadow-lg shadow-black/5">
        <View className="flex-row justify-between items-center mb-8">
          <View>
            <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium">Welcome back,</Text>
            <Text className="text-slate-900 dark:text-white text-3xl font-bold mt-1">{firstName}! 👋</Text>
          </View>
        </View>

        {/* Balance Card */}
        <View className="bg-blue-600 rounded-3xl p-6 shadow-xl shadow-blue-900/20 overflow-hidden relative">
          <View className="absolute -right-10 -top-10 w-40 h-40 bg-blue-500/30 rounded-full blur-2xl" />
          <View className="absolute -left-10 -bottom-10 w-40 h-40 bg-indigo-500/30 rounded-full blur-2xl" />

          <View className="flex-row justify-between items-start mb-2">
            <Text className="text-blue-100 font-medium">Total Balance</Text>
            <View className="bg-red-500/20 px-2 py-1 rounded-lg">
              <Text className="text-red-200 text-xs font-medium">
                Cost: KES {periodSummary.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
          <Text className="text-white text-4xl font-bold mb-2">
            KES {spending?.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </Text>

          <View className="flex-row justify-between gap-3 mt-4">
            <View className="flex-1 bg-green-500/30 px-3 py-2 rounded-xl">
              <Text className="text-green-100 text-xs mb-1">Income</Text>
              <Text className="text-white font-bold">KES {periodSummary.income.toLocaleString()}</Text>
            </View>
            <View className="flex-1 bg-red-500/30 px-3 py-2 rounded-xl">
              <Text className="text-red-100 text-xs mb-1">Expense</Text>
              <Text className="text-white font-bold">KES {periodSummary.expense.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* Period Selector */}
        <View className="flex-row bg-white dark:bg-[#1e293b] p-1 rounded-xl border border-gray-200 dark:border-slate-700 mt-6">
          {(['THIS_MONTH', 'LAST_MONTH', 'LAST 3 MONTHS', 'CURRENT YEAR'] as Period[]).map((period) => (
            <TouchableOpacity
              key={period}
              className={`flex-1 px-3 py-2 rounded-lg ${selectedPeriod === period ? 'bg-blue-600' : ''}`}
              onPress={() => {
                setPeriodLoading(true);
                setDisplayLimit(20);
                setTimeout(() => {
                  setSelectedPeriod(period);
                  setPeriodLoading(false);
                }, 100);
              }}
            >
              <Text className={`font-semibold text-[8px] text-center ${selectedPeriod === period ? 'text-white' : 'text-slate-400'}`}>
                {period.replace('_', ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Fuliza Section - Now using periodFulizaFees */}
      {((spending?.fulizaOutstanding !== undefined && spending.fulizaOutstanding > 0) || periodFulizaFees.length > 0) && (
        <View className="px-6 mt-8 mb-2">
          <Text className="text-slate-900 dark:text-white text-lg font-bold mb-4">Fuliza & Overdraft</Text>
          {spending?.fulizaOutstanding !== undefined && spending.fulizaOutstanding > 0 && (
            <View className="bg-orange-50 dark:bg-orange-900/10 p-5 rounded-2xl border border-orange-200 dark:border-orange-800 mb-6">
              <Text className="text-orange-800 dark:text-orange-200 font-bold text-base mb-1">Outstanding Loan</Text>
              <Text className="text-slate-900 dark:text-white text-3xl font-bold mb-1">
                KES {spending.fulizaOutstanding.toLocaleString()}
              </Text>
              <Text className="text-slate-500 dark:text-slate-400 text-xs">
                Daily: <Text className="font-bold">KES {calculateFulizaDailyCharge(spending.fulizaOutstanding).toFixed(2)}</Text>
              </Text>
            </View>
          )}

          {periodFulizaFees.slice(0, 12).map((tx: Transaction) => (
            <View key={tx.id} className="flex-row items-center bg-orange-50 dark:bg-orange-900/20 p-4 rounded-2xl border border-orange-100 dark:border-orange-800/50 mb-4">
              <View className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/40 items-center justify-center mr-4">
                <FontAwesome name="warning" size={16} color="#f97316" />
              </View>
              <View className="flex-1">
                <Text className="text-slate-900 dark:text-white font-bold text-sm">{tx.recipientName}</Text>
                <Text className="text-slate-500 text-[10px]">{tx.date.toLocaleDateString()}</Text>
              </View>
              <Text className="text-orange-600 dark:text-orange-400 font-bold">-KES {tx.amount.toLocaleString()}</Text>
            </View>
          ))}
          {periodFulizaFees.length > 11 && (
            <Text className="text-center text-slate-400 text-[10px] mb-4">plus {periodFulizaFees.length - 11} This are the fuliza for the current year</Text>
          )}
        </View>
      )}

      {/* Transactions Label */}
      <View className="px-6 mt-6 mb-4 flex-row justify-between items-center">
        <Text className="text-slate-900 dark:text-white text-lg font-bold">Recent Spendings</Text>
        <Text className="text-slate-500 text-xs">
          {filteredTransactions.length} items
        </Text>
      </View>

      {periodLoading && (
        <View className="px-6 pb-4">
          <ActivityIndicator size="small" color="#3b82f6" />
        </View>
      )}
    </View>
  );

  const renderTransaction = ({ item: tx }: { item: Transaction }) => (
    <TouchableOpacity
      className="flex-row items-center bg-white dark:bg-[#1e293b] mx-6 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm mb-4 active:opacity-70"
      onPress={() => handleTransactionPress(tx)}
    >
      <View className="w-12 h-12 rounded-full bg-gray-50 dark:bg-[#0f172a] items-center justify-center mr-4 border border-gray-100 dark:border-slate-700">
        <FontAwesome
          name={(tx.categoryIcon as any) || (tx.type === 'RECEIVED' ? 'arrow-down' : 'shopping-cart')}
          size={18}
          color={tx.categoryColor || (tx.type === 'RECEIVED' ? '#4ade80' : '#94a3b8')}
        />
      </View>
      <View className="flex-1">
        <Text className="text-slate-900 dark:text-white font-semibold text-base" numberOfLines={1}>{tx.recipientName}</Text>
        <View className="flex-row items-center mt-0.5">
          <View className={`px-1.5 py-0.5 rounded mr-2 ${tx.id.startsWith('IM_') ? 'bg-blue-100' : 'bg-green-100'}`}>
            <Text className={`text-[8px] font-bold ${tx.id.startsWith('IM_') ? 'text-blue-700' : 'text-green-700'}`}>
              {tx.id.startsWith('IM_') ? 'BANK' : 'M-PESA'}
            </Text>
          </View>
          <Text className="text-slate-400 text-[10px]">
            {tx.date.toLocaleDateString()}
          </Text>
        </View>
      </View>
      <Text className={`font-bold ${tx.type === 'RECEIVED' ? 'text-green-600' : 'text-slate-900 dark:text-white'}`}>
        {tx.type === 'RECEIVED' ? '+' : '-'} KES {tx.amount.toLocaleString()}
      </Text>
    </TouchableOpacity>
  );

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View className="px-6 pb-8">
          <TransactionSkeleton />
          <TransactionSkeleton />
          <TransactionSkeleton />
        </View>
      );
    }
    return <View className="h-24" />;
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-[#020617]">
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* Moved CategorizationModal outside FlatList to prevent flickering */}
      <CategorizationModal
        visible={modalVisible}
        transaction={activeTransaction}
        onCategorySelect={handleCategorySelect}
        onDateChange={handleDateChange}
        onDelete={handleDeleteTransaction}
        onClose={handleCloseModal}
      />

      <Animated.FlatList
        data={filteredTransactions
          .filter(t => !t.id.startsWith('FULIZA-FEES-'))
          .slice(0, displayLimit)}
        keyExtractor={(item) => item.id}
        renderItem={renderTransaction}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colorScheme === 'dark' ? '#fff' : '#000'}
          />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />
    </View>
  );
}
