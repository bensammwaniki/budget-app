import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import CategorizationModal from '../../components/CategorizationModal';
import { useAuth } from '../../services/AuthContext';
import {
  deleteTransaction,
  getCategories,
  getRecipientCategory,
  getSpendingSummary,
  getTransactions,
  getUserSettings,
  initDatabase,
  isMessageProcessed,
  markMessageAsProcessed,
  saveFulizaTransaction,
  saveRecipientCategory,
  saveTransaction,
  transactionExists,
  updateFulizaFees,
  updateTransactionCategory,
  updateTransactionDate
} from '../../services/database';
import { readMpesaSMS, SMSMessage } from '../../services/smsService';
import { Category, SpendingSummary, Transaction } from '../../types/transaction';
import { extractMpesaRefFromBankSms, parseBankSms } from '../../utils/bankParser';
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
      await updateFulizaFees();
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

    // Check if Bank SMS is enabled
    const imBankEnabled = await getUserSettings('bank_im_enabled') === 'true';

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

      // Try parsing as Bank SMS (if enabled)
      if (imBankEnabled && (msg.address.includes('I&M') || msg.address.includes('IMBank') || msg.address.includes('IANDMBANK'))) {
        console.log(`Checking Bank Message: ${msg.body.substring(0, 30)}...`);
        const parsed = parseBankSms(msg.body, msg.address);

        if (parsed) {
          // Duplicate Check
          const mpesaRef = extractMpesaRefFromBankSms(msg.body);
          if (mpesaRef) {
            const exists = await transactionExists(mpesaRef);
            if (exists) {
              console.log(`Skipping duplicate Bank transaction (Ref ${mpesaRef} exists)`);
              await markMessageAsProcessed(msg._id);
              continue;
            }
          }

          // Check if bank ref itself exists
          const bankTxExists = await transactionExists(parsed.id);
          if (bankTxExists) {
            // Already saved?
            await markMessageAsProcessed(msg._id);
            continue;
          }

          // Use SMS date
          parsed.date = new Date(msg.date);

          // Check category
          const savedCategoryId = await getRecipientCategory(parsed.recipientId, parsed.type);
          if (savedCategoryId) {
            parsed.categoryId = savedCategoryId;
          }

          await saveTransaction(parsed);
          await markMessageAsProcessed(msg._id);
          processedCount++;
          console.log(`✅ Bank Transaction Saved: ${parsed.recipientName} - ${parsed.amount}`);
          continue;
        }
      }

      // If we couldn't parse it, still mark as processed to avoid trying again
      await markMessageAsProcessed(msg._id);
    }

    if (processedCount > 0 || fulizaCount > 0) {
      console.log(`✅ Processed ${processedCount} transactions and ${fulizaCount} Fuliza events`);
    } else {
      console.log('✨ No new messages to process');
    }


    // Old logic removed - fees are now updated independently via updateFulizaFees()
    // This ensures fees are calculated even if no new SMS are received.
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
    let fulizaBalance = 0;

    filteredTransactions.forEach(t => {
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



  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    setModalVisible(false);
    try {
      // Just sync new data without clearing DB
      await syncSmsTransactions();
      await updateFulizaFees();
      await loadDashboardData();
    } catch (error) {
      console.error('Error during refresh:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

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

  const handleDeleteTransaction = async (tx: Transaction) => {
    try {
      // 1. Optimistic Update
      const updatedTransactions = transactions.filter(t => t.id !== tx.id);
      setTransactions(updatedTransactions);
      setModalVisible(false);
      setSelectedTransaction(null);

      // 2. DB Operation
      await deleteTransaction(tx.id);

      // 3. Refresh data to ensure all totals (like SpendingSummary) are re-calculated from DB
      await loadDashboardData();
    } catch (error) {
      console.error("Failed to delete transaction:", error);
      alert("Failed to delete transaction.");
      // Rollback would be nice here, but reloading data handles it
      await loadDashboardData();
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
        onDelete={handleDeleteTransaction}
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
            <View className="bg-red-500/20 px-2 py-1 rounded-lg">
              <Text className="text-red-200 text-xs font-medium">
                Transaction cost: KES {periodSummary.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
          <Text className="text-white text-4xl font-bold mb-2">
            KES {spending?.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </Text>
          <View className="flex-row items-center mb-6">
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
            {periodSummary.fulizaBalance > 0 && (
              <View className="flex-1 bg-orange-500/30 px-3 py-2 rounded-xl">
                <Text className="text-orange-100 text-xs mb-1">Fuliza</Text>
                <Text className="text-white font-bold">KES {periodSummary.fulizaBalance.toLocaleString()}</Text>
              </View>
            )}
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
                    name={(tx.categoryIcon as any) || (tx.type === 'RECEIVED' ? 'arrow-down' : (tx.id.startsWith('IM_CARD') || tx.rawSms.toLowerCase().includes('bank') ? 'bank' : 'shopping-cart'))}
                    size={18}
                    color={tx.categoryColor || (tx.type === 'RECEIVED' ? '#4ade80' : (tx.id.startsWith('IM_CARD') || tx.rawSms.toLowerCase().includes('bank') ? '#3b82f6' : '#94a3b8'))}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-slate-900 dark:text-white font-semibold text-base" numberOfLines={1}>{tx.recipientName}</Text>
                  <View className="flex-row items-center mt-0.5">
                    {/* Source Badge */}
                    <View className={`px-1.5 py-0.5 rounded mr-2 ${tx.id.startsWith('IM_') || tx.rawSms.toLowerCase().includes('bank') || tx.rawSms.toLowerCase().includes('purchase')
                      ? 'bg-blue-100 dark:bg-blue-900/40'
                      : 'bg-green-100 dark:bg-green-900/40'}`}>
                      <Text className={`text-[10px] font-bold ${tx.id.startsWith('IM_') || tx.rawSms.toLowerCase().includes('bank') || tx.rawSms.toLowerCase().includes('purchase')
                        ? 'text-blue-700 dark:text-blue-300'
                        : 'text-green-700 dark:text-green-300'}`}>
                        {tx.id.startsWith('IM_') || tx.rawSms.toLowerCase().includes('bank') || tx.rawSms.toLowerCase().includes('purchase') ? 'BANK' : 'M-PESA'}
                      </Text>
                    </View>

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
                  {tx.type === 'RECEIVED' ? '+' : '-'} KES {Math.abs(tx.amount).toLocaleString()}
                </Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View className="bg-white dark:bg-[#1e293b] rounded-2xl p-8 items-center border border-gray-200 dark:border-slate-800 border-dashed">
                <Text className="text-slate-500">No transactions found</Text>
              </View>
            }
            ListFooterComponent={
              displayLimit < filteredTransactions.length ? (
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
