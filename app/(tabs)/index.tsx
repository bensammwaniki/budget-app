import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, FlatList, Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import CategorizationModal from '../../components/CategorizationModal';
import { useAuth } from '../../services/AuthContext';
import { getCategories, getRecipientCategory, getSpendingSummary, getTransactions, initDatabase, isMessageProcessed, markMessageAsProcessed, saveFulizaTransaction, saveRecipientCategory, saveTransaction, updateTransactionCategory, updateTransactionDate } from '../../services/database';
import { readMpesaSMS, SMSMessage } from '../../services/smsService';
import { Category, SpendingSummary, Transaction } from '../../types/transaction';
import { calculateFulizaDailyCharge } from '../../utils/fulizaCalculator';
import { parseFulizaLoan, parseFulizaRepayment, parseMpesaSms } from '../../utils/smsParser';

type Period = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3_MONTHS' | 'ALL_TIME';

export default function HomeScreen() {
  const { user } = useAuth();
  const { colorScheme } = useColorScheme();
  const firstName = user?.displayName?.split(' ')[0] || 'User';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('THIS_MONTH');
  const [spending, setSpending] = useState<SpendingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(50);

  // Categorization State
  const [modalVisible, setModalVisible] = useState(false);
  const [uncategorizedQueue, setUncategorizedQueue] = useState<Transaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // Derived state: Use selectedTransaction if set (Edit Mode), otherwise check queue (Queue Mode)
  const activeTransaction = selectedTransaction || (uncategorizedQueue.length > 0 ? uncategorizedQueue[0] : null);

  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = async () => {
    try {
      await initDatabase();
      await syncSmsTransactions();
      await loadDashboardData();
    } catch (error) {
      console.error('Error initializing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncSmsTransactions = async () => {
    let messages: SMSMessage[] = [];

    if (Platform.OS === 'android') {
      try {
        const realSMS = await readMpesaSMS();
        if (realSMS.length > 0) {
          messages = realSMS;
        }
      } catch (error) {
        console.error('Failed to read SMS:', error);
      }
    }

    if (messages.length === 0) {
      return;
    }

    // Get Fuliza Charges category ID
    const categories = await getCategories();
    const fulizaCategory = categories.find(c => c.name === 'Fuliza Charges');
    const fulizaCategoryId = fulizaCategory?.id;

    // Collect all Fuliza events for processing
    const fulizaEvents: any[] = [];
    let processedCount = 0;
    let fulizaCount = 0;

    for (const msg of messages) {
      const smsText = msg.body;
      const smsDate = msg.date;

      // Skip if already processed
      if (await isMessageProcessed(msg._id)) {
        continue;
      }

      // Try parsing as regular transaction
      const transaction = parseMpesaSms(smsText);
      if (transaction) {
        // Check if we have a saved category for this recipient AND type
        const savedCategoryId = await getRecipientCategory(transaction.recipientId, transaction.type);
        if (savedCategoryId) {
          transaction.categoryId = savedCategoryId;
        }
        await saveTransaction(transaction);
        await markMessageAsProcessed(msg._id);
        processedCount++;
        continue;
      }

      // Try parsing as Fuliza loan
      const fulizaLoan = parseFulizaLoan(smsText, smsDate);
      if (fulizaLoan) {
        await saveFulizaTransaction(fulizaLoan);
        fulizaEvents.push(fulizaLoan);
        await markMessageAsProcessed(msg._id);
        fulizaCount++;
        continue;
      }

      // Try parsing as Fuliza repayment
      const fulizaRepayment = parseFulizaRepayment(smsText, smsDate);
      if (fulizaRepayment) {
        await saveFulizaTransaction(fulizaRepayment);
        fulizaEvents.push(fulizaRepayment);
        await markMessageAsProcessed(msg._id);
        fulizaCount++;
        continue;
      }

      // If we couldn't parse it, still mark as processed to avoid trying again
      await markMessageAsProcessed(msg._id);
    }


    // Calculate comprehensive monthly costs (Access Fees + Daily Maintenance)
    if (fulizaCategoryId && fulizaEvents.length > 0) {
      // Import dynamically to avoid circular dependency issues if any
      const { calculateMonthlyFulizaCosts } = await import('../../utils/fulizaCalculator');
      const monthlyCosts = calculateMonthlyFulizaCosts(fulizaEvents);

      for (const [monthKey, totalCost] of monthlyCosts.entries()) {
        const [year, month] = monthKey.split('-');
        const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long' });

        // Use the last day of the month as the date for the fee transaction
        const feeDate = new Date(parseInt(year), parseInt(month), 0);

        const bundledAccessFeeTransaction: Transaction = {
          id: `FULIZA-FEES-${monthKey}`, // Unique ID per month
          amount: totalCost,
          type: 'SENT',
          recipientId: 'FULIZA-ACCESS-FEES',
          recipientName: `Fuliza Fees (${monthName})`,
          date: feeDate,
          balance: 0,
          transactionCost: 0,
          categoryId: fulizaCategoryId,
          rawSms: `Bundled Fuliza fees (Access + Daily) for ${monthName} ${year}: KES ${totalCost.toFixed(2)}`
        };
        await saveTransaction(bundledAccessFeeTransaction);
      }
    }
  };

  const loadDashboardData = async () => {
    const txs = await getTransactions();
    const summary = await getSpendingSummary();
    setTransactions(txs);
    setSpending(summary);

    // Check for ALL uncategorized transactions (both SENT and RECEIVED)
    const uncategorized = txs.filter(t => !t.categoryId);
    if (uncategorized.length > 0) {
      setUncategorizedQueue(uncategorized);
      setModalVisible(true);
    }
  };

  // Filter transactions based on selected period
  const filteredTransactions = useMemo(() => {
    const now = new Date();

    return transactions.filter(t => {
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
      } else if (selectedPeriod === 'LAST_3_MONTHS') {
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3);
        return txDate >= threeMonthsAgo;
      }
      // ALL_TIME
      return true;
    });
  }, [transactions, selectedPeriod]);

  // Calculate summary statistics for the selected period
  const periodSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    let cost = 0;

    filteredTransactions.forEach(t => {
      if (t.type === 'RECEIVED') {
        income += t.amount;
      } else {
        // SENT (includes Fuliza fees, transfers, etc.)
        expense += t.amount;
      }
      cost += t.transactionCost || 0;
    });

    return {
      income,
      expense,
      cost,
      net: income - expense
    };
  }, [filteredTransactions]);



  const handleRefresh = async () => {
    setRefreshing(true);
    setModalVisible(false); // Close modal during refresh
    try {
      // Import clearDatabase dynamically to avoid circular dependency
      const { clearDatabase } = await import('../../services/database');

      // Clear all database tables
      await clearDatabase();

      // Reinitialize everything fresh
      await initDatabase();
      await syncSmsTransactions();
      await loadDashboardData();
    } catch (error) {
      console.error('Error during refresh:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleTransactionPress = (tx: Transaction) => {
    // Allow categorizing both SENT and RECEIVED transactions
    setSelectedTransaction(tx);
    setModalVisible(true);
  };

  const handleCategorySelect = async (category: Category) => {
    if (activeTransaction) {
      // OPTIMISTIC UPDATE: Update UI immediately
      const updatedTransactions = transactions.map(t => {
        if (t.id === activeTransaction.id) {
          return {
            ...t,
            categoryId: category.id,
            categoryName: category.name,
            categoryIcon: category.icon,
            categoryColor: category.color
          };
        }
        return t;
      });
      setTransactions(updatedTransactions);

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
        await updateTransactionCategory(activeTransaction.id, category.id);

        // 3. Reload data silently to ensure consistency (especially spending summary)
        await loadDashboardData();
      } catch (error) {
        console.error("Failed to save category:", error);
        // Revert UI if needed (optional, but good practice)
        // For now, we assume success as DB is local
      }
    }
  };

  const handleDateChange = async (newDate: Date) => {
    if (activeTransaction) {
      try {
        await updateTransactionDate(activeTransaction.id, newDate);
        setModalVisible(false);
        setSelectedTransaction(null);
        await loadDashboardData(); // Refresh to reflect date change
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

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-[#020617] items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-gray-50 dark:bg-[#020617]"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colorScheme === 'dark' ? '#fff' : '#000'} />}
    >
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <CategorizationModal
        visible={modalVisible}
        transaction={activeTransaction}
        onCategorySelect={handleCategorySelect}
        onDateChange={handleDateChange}
        onClose={handleCloseModal}
      />

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
          {/* Background decoration */}
          <View className="absolute -right-10 -top-10 w-40 h-40 bg-blue-500/30 rounded-full blur-2xl" />
          <View className="absolute -left-10 -bottom-10 w-40 h-40 bg-indigo-500/30 rounded-full blur-2xl" />

          <View className="flex-row justify-between items-start mb-2">
            <Text className="text-blue-100 font-medium">Total Balance</Text>
            <View className="bg-green-500/20 px-2 py-1 rounded-lg">
              <Text className="text-green-200 text-xs font-medium">
                Income: KES {periodSummary.income.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
          <Text className="text-white text-4xl font-bold mb-2">
            KES {spending?.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </Text>
          <View className="flex-row items-center mb-6">
            <View className="bg-red-500/20 px-2 py-1 rounded-lg">
              <Text className="text-red-200 text-xs font-medium">
                Transaction cost: KES {periodSummary.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>

          {/* Fuliza Debt Warning - Only show if user has outstanding Fuliza */}
          {spending?.fulizaOutstanding !== undefined && spending.fulizaOutstanding > 0 && (
            <View className="bg-orange-500/20 px-3 py-2 rounded-lg mb-6">
              <Text className="text-orange-200 text-xs font-medium">
                ⚠️ Fuliza Debt: KES {spending.fulizaOutstanding.toLocaleString()}
              </Text>
              <Text className="text-orange-300 text-[10px] mt-0.5">
                Daily charge: KES {calculateFulizaDailyCharge(spending.fulizaOutstanding).toFixed(2)} • Repay soon to minimize fees
              </Text>
            </View>
          )}

          <View className="flex-row justify-between gap-3">
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
          <TouchableOpacity
            className={`flex-1 px-3 py-2 rounded-lg ${selectedPeriod === 'THIS_MONTH' ? 'bg-blue-600' : ''}`}
            onPress={() => {
              setPeriodLoading(true);
              setDisplayLimit(50);
              setTimeout(() => {
                setSelectedPeriod('THIS_MONTH');
                setPeriodLoading(false);
              }, 0);
            }}
          >
            <Text className={`font-semibold text-xs text-center ${selectedPeriod === 'THIS_MONTH' ? 'text-white' : 'text-slate-400'}`}>This Month</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 px-3 py-2 rounded-lg ${selectedPeriod === 'LAST_MONTH' ? 'bg-blue-600' : ''}`}
            onPress={() => {
              setPeriodLoading(true);
              setDisplayLimit(50);
              setTimeout(() => {
                setSelectedPeriod('LAST_MONTH');
                setPeriodLoading(false);
              }, 0);
            }}
          >
            <Text className={`font-semibold text-xs text-center ${selectedPeriod === 'LAST_MONTH' ? 'text-white' : 'text-slate-400'}`}>Last Month</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 px-3 py-2 rounded-lg ${selectedPeriod === 'LAST_3_MONTHS' ? 'bg-blue-600' : ''}`}
            onPress={() => {
              setPeriodLoading(true);
              setDisplayLimit(50);
              setTimeout(() => {
                setSelectedPeriod('LAST_3_MONTHS');
                setPeriodLoading(false);
              }, 0);
            }}
          >
            <Text className={`font-semibold text-xs text-center ${selectedPeriod === 'LAST_3_MONTHS' ? 'text-white' : 'text-slate-400'}`}>Last 3M</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 px-3 py-2 rounded-lg ${selectedPeriod === 'ALL_TIME' ? 'bg-blue-600' : ''}`}
            onPress={() => {
              setPeriodLoading(true);
              setDisplayLimit(50);
              setTimeout(() => {
                setSelectedPeriod('ALL_TIME');
                setPeriodLoading(false);
              }, 0);
            }}
          >
            <Text className={`font-semibold text-xs text-center ${selectedPeriod === 'ALL_TIME' ? 'text-white' : 'text-slate-400'}`}>All Time</Text>
          </TouchableOpacity>
        </View>
      </View>



      {/* Monthly Fuliza Fees - Always displayed */}
      <View className="px-6 mt-8 mb-2">
        <Text className="text-slate-900 dark:text-white text-lg font-bold mb-4">Monthly Fuliza Fees</Text>
        {filteredTransactions.filter(t => t.id.startsWith('FULIZA-FEES-')).length > 0 ? (
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
        ) : (
          <View className="bg-gray-50 dark:bg-slate-800/50 rounded-2xl p-6 border border-gray-200 dark:border-slate-700 border-dashed">
            <Text className="text-slate-500 dark:text-slate-400 text-center text-sm">
              No Fuliza fees for this period
            </Text>
          </View>
        )}
      </View>

      {/* Recent Transactions */}
      <View className="px-6 mt-6 mb-8">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-slate-900 dark:text-white text-lg font-bold">Recent Spendings</Text>
          <Text className="text-slate-500 dark:text-slate-400 text-xs">
            {selectedPeriod === 'THIS_MONTH' ? 'This Month' : selectedPeriod === 'LAST_MONTH' ? 'Last Month' : selectedPeriod === 'LAST_3_MONTHS' ? 'Last 3 Months' : 'All Time'}
          </Text>
        </View>

        {periodLoading ? (
          <View className="bg-white dark:bg-[#1e293b] rounded-2xl p-8 items-center border border-gray-200 dark:border-slate-800">
            <ActivityIndicator size="small" color="#3b82f6" />
            <Text className="text-slate-500 dark:text-slate-400 text-sm mt-2">Loading...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredTransactions
              .filter(t => !t.id.startsWith('FULIZA-FEES-'))
              .slice(0, displayLimit)}
            keyExtractor={(item) => item.id}
            scrollEnabled={false} // Let parent ScrollView handle scrolling
            contentContainerStyle={{ gap: 16 }}
            renderItem={({ item: tx }) => (
              <TouchableOpacity
                className="flex-row items-center bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm active:bg-gray-50 dark:active:bg-slate-800"
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
                    {tx.categoryName && (
                      <Text className="text-xs font-medium mr-2" style={{ color: tx.categoryColor }}>
                        {tx.categoryName}
                      </Text>
                    )}
                    <Text className="text-slate-500 text-xs">
                      {tx.date.toLocaleDateString()} • {tx.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
                <Text className={`font-bold ${tx.type === 'RECEIVED' ? 'text-green-600 dark:text-green-400' : 'text-slate-900 dark:text-white'}`}>
                  {tx.type === 'RECEIVED' ? '+' : '-'} KES {tx.amount.toLocaleString()}
                </Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View className="bg-white dark:bg-[#1e293b] rounded-2xl p-8 items-center border border-gray-200 dark:border-slate-800 border-dashed">
                <Text className="text-slate-500">No transactions found</Text>
              </View>
            }
            ListFooterComponent={
              displayLimit < filteredTransactions.filter(t => !t.id.startsWith('FULIZA-FEES-')).length ? (
                <TouchableOpacity
                  className="py-4 items-center"
                  onPress={() => setDisplayLimit(prev => prev + 50)}
                >
                  <Text className="text-blue-600 font-semibold">Load More</Text>
                </TouchableOpacity>
              ) : null
            }
          />
        )}
      </View>
    </ScrollView>
  );
}
