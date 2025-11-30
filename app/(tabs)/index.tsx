import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import CategorizationModal from '../../components/CategorizationModal';
import { useAuth } from '../../services/AuthContext';
import { getRecipientCategory, getSpendingSummary, getTransactions, initDatabase, saveRecipientCategory, saveTransaction, updateTransactionCategory } from '../../services/database';
import { readMpesaSMS } from '../../services/smsService';
import { Category, SpendingSummary, Transaction } from '../../types/transaction';
import { parseMpesaSms } from '../../utils/smsParser';

export default function HomeScreen() {
  const { user } = useAuth();
  const { colorScheme } = useColorScheme();
  const firstName = user?.displayName?.split(' ')[0] || 'User';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [spending, setSpending] = useState<SpendingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
    let messages: string[] = [];

    if (Platform.OS === 'android') {
      try {
        const realSMS = await readMpesaSMS();
        if (realSMS.length > 0) {
          console.log(`Found ${realSMS.length} M-PESA messages from device.`);
          messages = realSMS;
        }
      } catch (error) {
        console.log('Failed to read SMS:', error);
      }
    }

    for (const sms of messages) {
      const transaction = parseMpesaSms(sms);
      if (transaction) {
        // Check if we have a saved category for this recipient AND type
        const savedCategoryId = await getRecipientCategory(transaction.recipientId, transaction.type);
        if (savedCategoryId) {
          transaction.categoryId = savedCategoryId;
        }
        await saveTransaction(transaction);
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
                Income: KES {spending?.totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </Text>
            </View>
          </View>
          <Text className="text-white text-4xl font-bold mb-2">
            KES {spending?.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </Text>
          <View className="flex-row items-center mb-6">
            <View className="bg-red-500/20 px-2 py-1 rounded-lg">
              <Text className="text-red-200 text-xs font-medium">
                Transaction cost: KES {spending?.monthlyTransactionCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </Text>
            </View>
          </View>

          <View className="flex-row justify-between gap-3">
            <View className="flex-1 bg-blue-500/30 px-3 py-2 rounded-xl">
              <Text className="text-blue-100 text-xs mb-1">Today</Text>
              <Text className="text-white font-bold">KES {spending?.dailyTotal.toLocaleString()}</Text>
            </View>
            <View className="flex-1 bg-blue-500/30 px-3 py-2 rounded-xl">
              <Text className="text-blue-100 text-xs mb-1">This Week</Text>
              <Text className="text-white font-bold">KES {spending?.weeklyTotal.toLocaleString()}</Text>
            </View>
            <View className="flex-1 bg-blue-500/30 px-3 py-2 rounded-xl">
              <Text className="text-blue-100 text-xs mb-1">This Month</Text>
              <Text className="text-white font-bold">KES {spending?.monthlyTotal.toLocaleString()}</Text>
            </View>
          </View>
        </View>
      </View>



      {/* Recent Transactions */}
      <View className="px-6 mt-8 mb-8">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-slate-900 dark:text-white text-lg font-bold">Recent Spendings</Text>
        </View>

        <View className="gap-4">
          {transactions.map((tx) => (
            <TouchableOpacity
              key={tx.id}
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
          ))}

          {transactions.length === 0 && (
            <View className="bg-white dark:bg-[#1e293b] rounded-2xl p-8 items-center border border-gray-200 dark:border-slate-800 border-dashed">
              <Text className="text-slate-500">No transactions found</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
