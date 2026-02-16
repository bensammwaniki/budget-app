import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import CategorizationModal from '../../components/CategorizationModal';
import { TransactionSkeleton } from '../../components/SkeletonLoader';
import TransactionItem from '../../components/TransactionItem';
import { useAlert } from '../../context/AlertContext';
import { useSpendingSummary, useTransactions } from '../../hooks/useDatabase';
import { useAuth } from '../../services/AuthContext';
import {
  deleteTransaction,
  getUserSettings,
  saveRecipientCategory,
  subscribeToDatabaseChanges,
  updateFulizaFees,
  updateTransactionCategory,
  updateTransactionDate
} from '../../services/database';
import { debtService } from '../../services/debtService';
import { useScrollVisibility } from '../../services/ScrollContext';
import { syncMessages } from '../../services/smsService';
import { Category, Transaction } from '../../types/transaction';
// calculateFulizaDailyCharge removed - now handled in debt detail if needed

type Period = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST 3 MONTHS' | 'CURRENT YEAR';

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
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
  const [appIsLaunching, setAppIsLaunching] = useState(true);
  const [isCategorizationSuppressed, setIsCategorizationSuppressed] = useState(false);
  const [hasPerformedSyncOnce, setHasPerformedSyncOnce] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [imBankEnabled, setImBankEnabled] = useState(false);

  // Categorization State
  const [modalVisible, setModalVisible] = useState(false);
  const [uncategorizedQueue, setUncategorizedQueue] = useState<Transaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [debtSummary, setDebtSummary] = useState<{
    totalLiabilities: number;
    totalReceivables: number;
    netDebt: number;
    activeDebts: number;
  } | null>(null);
  const [dbReady, setDbReady] = useState(false);

  const { showAlert } = useAlert();
  const activeTransaction = selectedTransaction || (uncategorizedQueue.length > 0 ? uncategorizedQueue[0] : null);

  // Force skeleton during initial mount until the first sync batch (30 days or quick refresh) is done
  const initialLoading = appIsLaunching && !hasPerformedSyncOnce;

  // Load bank settings and subscribe to changes
  useEffect(() => {
    if (!dbReady) return;

    const loadBankSettings = async () => {
      try {
        const enabled = await getUserSettings('bank_im_enabled');
        setImBankEnabled(enabled === 'true');
      } catch (error) {
        console.error('Error loading bank settings:', error);
      }
    };

    loadBankSettings();

    // Subscribe to settings changes so we update when user toggles banks
    const unsubscribe = subscribeToDatabaseChanges((type) => {
      if (type === 'SETTINGS') {
        loadBankSettings();
      }
    });

    return unsubscribe;
  }, [dbReady]);

  // Load debt summary
  useEffect(() => {
    if (!dbReady) return;

    const loadDebtSummary = async () => {
      try {
        const summary = await debtService.getDebtSummary('local_user');
        setDebtSummary(summary);
      } catch (error) {
        console.error('Error loading debt summary:', error);
      }
    };

    loadDebtSummary();

    // Subscribe to transaction changes to refresh debt summary
    const unsubscribe = subscribeToDatabaseChanges((type) => {
      if (type === 'TRANSACTIONS') {
        loadDebtSummary();
      }
    });

    return unsubscribe;
  }, [dbReady]);

  useEffect(() => {
    const runProgressiveSync = async () => {
      try {
        setIsSyncing(true);
        // initDatabase() call removed - now handled in Root Layout
        setDbReady(true);

        const lastSync = await getUserSettings('last_sync_timestamp');

        if (!lastSync) {
          // FIRST LAUNCH: Dual-Stage Sync
          console.log('🚀 First launch: Starting Quick Start sync (30 days)...');
          await syncMessages(30);
          await updateFulizaFees();
          setHasPerformedSyncOnce(true);
          setAppIsLaunching(false);

          console.log('⏳ Quick start complete. Starting Background Deep Sync (366 days)...');
          // Keep isSyncing true during background sync
          syncMessages(366).then(() => {
            console.log('✅ Deep sync complete.');
            updateFulizaFees();
            setIsSyncing(false);
          }).catch(err => {
            console.error('Deep sync error:', err);
            setIsSyncing(false);
          });
        } else {
          // NORMAL LAUNCH: Quick refresh
          await syncMessages(7);
          await updateFulizaFees();
          setIsSyncing(false);
          setHasPerformedSyncOnce(true);
          setAppIsLaunching(false);
        }
      } catch (error) {
        console.error('Error in progressive sync:', error);
        setIsSyncing(false);
        setAppIsLaunching(false);
      }
    };
    runProgressiveSync();
  }, []);

  useEffect(() => {
    // Check for ALL uncategorized transactions (both SENT and RECEIVED)
    const uncategorized = allTransactions.filter(t => !t.categoryId);

    // Only auto-trigger if not suppressed and not already in an edit mode
    if (uncategorized.length > 0 && !modalVisible && !selectedTransaction && !isCategorizationSuppressed) {
      setUncategorizedQueue(uncategorized);
      setModalVisible(true);
    }
  }, [allTransactions, isCategorizationSuppressed]);

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

  // Filter transactions based on selected period AND bank settings
  const filteredTransactions = useMemo(() => {
    const filtered = allTransactions.filter((t: Transaction) => {
      // Filter out bank transactions if bank is disabled
      const isBankTransaction = t.id.startsWith('IM_');

      if (isBankTransaction && !imBankEnabled) {
        return false; // Hide bank transactions when bank is disabled
      }

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

    // Debug: Count bank transactions
    const bankTransactions = filtered.filter(t => t.id.startsWith('IM_'));

    // Show sample IDs to verify what's in the database
    const sampleIds = allTransactions.slice(0, 10).map(t => t.id);
    console.log(`📊 Total transactions: ${allTransactions.length}, Filtered: ${filtered.length}, Bank: ${bankTransactions.length}`);
    console.log(`🔍 Sample transaction IDs:`, sampleIds);
    if (bankTransactions.length > 0) {
      console.log(`🏦 Bank transaction IDs:`, bankTransactions.map(t => t.id));
    }

    return filtered;
  }, [allTransactions, selectedPeriod, dateRange, imBankEnabled]);

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
        expense += t.amount;
      }
      cost += t.transactionCost || 0;
    });

    return {
      income,
      expense,
      cost
    };
  }, [filteredTransactions, spending, selectedPeriod]);

  const handleTransactionPress = (tx: Transaction) => {
    setSelectedTransaction(tx);
    setModalVisible(true);
  };

  const handleCategorySelect = async (category: Category) => {
    if (activeTransaction) {
      if (selectedTransaction) {
        setModalVisible(false);
        setSelectedTransaction(null);
      } else {
        const newQueue = uncategorizedQueue.slice(1);
        setUncategorizedQueue(newQueue);
        if (newQueue.length === 0) {
          setModalVisible(false);
        }
      }

      try {
        if (activeTransaction.recipientId) {
          await saveRecipientCategory(activeTransaction.recipientId, category.id, activeTransaction.type);
        }
        await updateTransactionCategory(activeTransaction.id, category.id);
      } catch (error) {
        console.error("Failed to save category:", error);
      }
    }
  };


  const handleDeleteTransaction = async (tx: Transaction) => {
    // Show confirmation dialog before deleting
    showAlert({
      title: 'Delete Transaction',
      message: 'Are you sure you want to delete this transaction?',
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => { } }, // Just close alert
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setModalVisible(false);
              setSelectedTransaction(null);
              await deleteTransaction(tx.id);

              // Optional: Show success alert or toast
            } catch (error) {
              console.error("Failed to delete transaction:", error);
              showAlert({
                title: 'Error',
                message: 'Could not delete transaction.',
                type: 'error'
              });
            }
          }
        }
      ]
    });
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
    // If the user manually closes the modal, suppress auto-triggers for this session
    setIsCategorizationSuppressed(true);
  };

  const handleEndReached = () => {
    if (loadingMore || displayLimit >= filteredTransactions.length) return;
    setLoadingMore(true);
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
        showTabBar();
      } else if (diff > 5) {
        hideTabBar();
      }
      lastScrollY.value = currentY;
    },
  });

  // if (initialLoading) {
  //   return <HomeSkeleton />;
  // }

  const renderHeader = () => (
    <View>
      <View className="px-6 pt-16 pb-8 bg-white dark:bg-[#0f172a] rounded-b-[32px] border-b border-gray-200 dark:border-slate-800 shadow-lg shadow-black/5">
        <View className="flex-row justify-between items-center mb-8">
          <View>
            <View className="flex-row items-center gap-2">
              <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                Welcome back,
              </Text>

              {isSyncing && (
                <View className="flex-row items-center dark:bg-blue-900/20 px-2 py-0.5">
                  <ActivityIndicator
                    size="small"
                    color="#3b82f6"
                    style={{ transform: [{ scale: 0.6 }] }}
                  />
                  <Text className="text-blue-600 dark:text-blue-400 text-[10px] font-bold ml-0.5">
                    Syncing SMS...
                  </Text>
                </View>
              )}
            </View>

            <Text className="text-slate-900 dark:text-white text-3xl font-bold mt-1">{firstName}! 👋</Text>
          </View>
        </View>

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

      {/* Debt Summary Widget */}
      {debtSummary && debtSummary.activeDebts > 0 && (
        <View className="px-6 mt-8 mb-2">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-slate-900 dark:text-white text-lg font-bold">Debts</Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/debts')}
              className="flex-row items-center gap-1"
            >
              <Text className="text-blue-600 dark:text-blue-400 text-sm font-medium">View All</Text>
              <FontAwesome name="chevron-right" size={12} color="#3b82f6" />
            </TouchableOpacity>
          </View>

          <View className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/10 dark:to-blue-900/10 p-5 rounded-2xl border border-purple-200 dark:border-purple-800">
            <View className="flex-row justify-between items-start mb-1">
              <View className="flex-1">
                <Text className="text-purple-800 dark:text-purple-200 font-bold text-base mb-1">Total Debt</Text>
                <Text className="text-slate-900 dark:text-white text-3xl font-bold">
                  KES {Math.abs(debtSummary.netDebt).toLocaleString()}
                </Text>
                <Text className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                  {debtSummary.activeDebts} active {debtSummary.activeDebts === 1 ? 'debt' : 'debts'}
                </Text>
              </View>
              <View className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/40 items-center justify-center">
                <FontAwesome name="exchange" size={20} color="#9333ea" />
              </View>
            </View>

            {debtSummary.activeDebts > 0 && (
              <View className="flex-row justify-between items-center mb-1 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                <View>
                  <Text className="text-slate-500 text-xs font-bold uppercase mb-1">Debt Summary</Text>
                  <View className="flex-row items-center gap-4">
                    {debtSummary.totalLiabilities > 0 && (
                      <View>
                        <Text className="text-[10px] text-slate-400 font-semibold uppercase">I Owe</Text>
                        <Text className="text-red-600 dark:text-red-400 font-bold text-sm">KES {debtSummary.totalLiabilities.toLocaleString()}</Text>
                      </View>
                    )}
                    {debtSummary.totalReceivables > 0 && (
                      <View>
                        <Text className="text-[10px] text-slate-400 font-semibold uppercase">Owed to Me</Text>
                        <Text className="text-green-600 dark:text-green-400 font-bold text-sm">KES {debtSummary.totalReceivables.toLocaleString()}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-[10px] text-slate-400 font-semibold uppercase mb-1">Active Debts</Text>
                  <Text className="text-slate-900 dark:text-white font-bold text-sm">{debtSummary.activeDebts}</Text>
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      <View className="px-6 mt-6 mb-4 flex-row justify-between items-center">
        <Text className="text-slate-900 dark:text-white text-lg font-bold">Recent Transactions</Text>
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
        renderItem={({ item }) => (
          <TransactionItem
            transaction={item}
            onPress={handleTransactionPress}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        updateCellsBatchingPeriod={50}
        getItemLayout={(data, index) => (
          { length: 86, offset: 86 * index, index }
        )}
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
